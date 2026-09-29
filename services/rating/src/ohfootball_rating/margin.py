"""A rating in points that predicts the score margin of a game.

Each team has one rating for each season. The rating of team A minus the rating of team B, plus
an edge for the home team, is the margin that the model expects. After a game, each rating moves
toward the margin that the game had. A logistic curve then turns the expected margin into a win
probability.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from itertools import groupby
from math import exp

from .games import Game, chronological

RatingKey = tuple[int, str]
# The final rating of each season that a program played, by season.
ProgramHistory = Mapping[str, Mapping[int, float]]

PLAYOFF_BUCKET = "playoff"
# The predictions table refuses a probability of exactly 0 or 1, and the log loss of such a
# forecast is infinite. A margin must be larger than about 200 points before the curve reaches
# these limits, so the limits only guard the edges.
PROBABILITY_FLOOR = 1e-9
# The slope fit starts here and looks for the slope between zero and the upper limit.
SLOPE_START = 0.1
SLOPE_LIMIT = 100.0


@dataclass(frozen=True, slots=True)
class MarginConfig:
    home_edge: float = 1.5
    margin_cap: float = 56.0
    learning_rate: float = 1.65
    learning_offset: float = 5.0
    division_step: float = 12.0
    carryover_last: float = 0.8
    carryover_older: float = 0.2
    history_seasons: int = 8
    slope_seasons: int = 10
    bucket_games: int = 6
    fallback_slope: float = 0.10

    def __post_init__(self) -> None:
        if self.home_edge < 0:
            raise ValueError("home_edge cannot be negative")
        if self.margin_cap <= 0:
            raise ValueError("margin_cap must be greater than zero")
        if self.learning_rate <= 0:
            raise ValueError("learning_rate must be greater than zero")
        if self.learning_offset <= 0:
            raise ValueError("learning_offset must be greater than zero")
        if self.division_step < 0:
            raise ValueError("division_step cannot be negative")
        if not 0.0 <= self.carryover_last <= 1.0:
            raise ValueError("carryover_last must be between zero and one")
        if not 0.0 <= self.carryover_older <= 1.0:
            raise ValueError("carryover_older must be between zero and one")
        if self.carryover_last + self.carryover_older > 1.0:
            raise ValueError("the two carryover values cannot add up to more than one")
        if self.history_seasons < 1:
            raise ValueError("history_seasons must be at least one")
        if self.slope_seasons < 1:
            raise ValueError("slope_seasons must be at least one")
        if self.bucket_games < 0:
            raise ValueError("bucket_games cannot be negative")
        if self.fallback_slope <= 0:
            raise ValueError("fallback_slope must be greater than zero")

    def learning_weight(self, scored_games: int) -> float:
        """Give the share of a surprise that moves the rating of a team.

        The share is large at the start of a season, when a team has played few games, and it
        becomes smaller with each game that has a score.
        """
        return self.learning_rate / (scored_games + self.learning_offset)


@dataclass(frozen=True, slots=True)
class MarginPrediction:
    game_key: str
    season: int
    game_date: date
    team_a_key: str
    team_a_name: str
    team_b_key: str
    team_b_name: str
    team_a_rating: float
    team_b_rating: float
    predicted_margin: float
    team_a_win_probability: float
    actual_team_a_score: float | None
    actual_margin: int | None
    bucket: str
    slope: float
    is_team_a_home: bool
    is_team_b_home: bool
    is_playoff_game: bool
    team_a_games_played: int
    team_b_games_played: int


@dataclass(frozen=True, slots=True)
class MarginBacktestResult:
    predictions: tuple[MarginPrediction, ...]
    ratings: Mapping[RatingKey, float]
    program_history: ProgramHistory
    games_played: Mapping[RatingKey, int]
    scored_games: Mapping[RatingKey, int]
    slopes: Mapping[int, Mapping[str, float]]


def win_probability(predicted_margin: float, slope: float) -> float:
    """Turn an expected margin into the probability that team A wins."""
    x = slope * predicted_margin
    if x >= 0:
        probability = 1.0 / (1.0 + exp(-x))
    else:
        weight = exp(x)
        probability = weight / (1.0 + weight)
    return min(max(probability, PROBABILITY_FLOOR), 1.0 - PROBABILITY_FLOOR)


def bucket(
    team_a_games_played: int,
    team_b_games_played: int,
    is_playoff_game: bool,
    config: MarginConfig,
) -> str:
    """Name the group of games that shares one slope.

    A playoff game has a group of its own. A regular season game goes into a group by the smaller
    number of games that the two teams have played this season, up to a limit.
    """
    if is_playoff_game:
        return PLAYOFF_BUCKET
    return f"games_{min(team_a_games_played, team_b_games_played, config.bucket_games)}"


def opening_rating(
    *,
    season: int,
    program_id: str,
    division: int | None,
    program_history: ProgramHistory,
    config: MarginConfig,
) -> float:
    """Give the rating a team carries into its first game of a season.

    A program with no earlier season starts at a prior set by its division. A returning program
    starts from the final rating of the most recent season it played, mixed with the mean final
    rating of the earlier seasons in the history window. With the default values the two
    carryover shares add up to one, so the division prior has no effect on a returning program.
    Most returning programs have ratings above the priors, so a new program starts below most
    other teams. The size of that gap depends on a replay of the whole record from 1972.
    """
    prior = config.division_step * (4 - division) if division is not None else 0.0
    history = program_history.get(program_id, {})
    earlier = [played for played in history if played < season]
    if not earlier:
        return prior
    last_season = max(earlier)
    last = history[last_season]
    older_ratings = [
        history[played]
        for played in range(last_season - config.history_seasons, last_season)
        if played in history
    ]
    older = sum(older_ratings) / len(older_ratings) if older_ratings else last
    return prior + config.carryover_last * (last - prior) + config.carryover_older * (older - prior)


def fit_slope(
    rows: Sequence[tuple[float, float]],
    *,
    fallback: float,
    iterations: int = 100,
) -> float:
    """Fit the slope of a logistic curve through the origin.

    Each row holds an expected margin and a result: 1 for a win of team A, 0.5 for a tie and 0
    for a loss. The log likelihood of the slope has one peak, so its gradient falls as the slope
    rises. The fit keeps a bracket around the peak and takes a Newton step when the step stays in
    the bracket. Otherwise it halves the bracket. The fallback is returned when the rows cannot
    give a positive slope below the upper limit, or when the fit does not converge.
    """
    results = {result for _, result in rows}
    if 1.0 not in results or 0.0 not in results:
        return fallback
    if _gradient(rows, 0.0)[0] <= 0 or _gradient(rows, SLOPE_LIMIT)[0] > 0:
        return fallback
    low, high = 0.0, SLOPE_LIMIT
    slope = SLOPE_START
    for _ in range(iterations):
        gradient, curvature = _gradient(rows, slope)
        if gradient > 0:
            low = slope
        else:
            high = slope
        following = slope + gradient / curvature if curvature > 1e-12 else high
        if not low < following < high:
            following = (low + high) / 2
        if abs(following - slope) < 1e-10:
            return following
        slope = following
    return fallback


def _gradient(rows: Sequence[tuple[float, float]], slope: float) -> tuple[float, float]:
    """Give the first derivative of the log likelihood and its curvature at a slope."""
    gradient = 0.0
    curvature = 0.0
    for margin, result in rows:
        probability = win_probability(margin, slope)
        gradient += (result - probability) * margin
        curvature += probability * (1.0 - probability) * margin * margin
    return gradient, curvature


def fit_slopes(
    predictions: Iterable[MarginPrediction],
    season: int,
    config: MarginConfig,
) -> dict[str, float]:
    """Fit one slope for each group on the seasons in the slope window before a season.

    A season never uses its own games, so every probability in a backtest is out of sample.
    """
    rows: defaultdict[str, list[tuple[float, float]]] = defaultdict(list)
    for prediction in predictions:
        if prediction.actual_team_a_score is None:
            continue
        if season - config.slope_seasons <= prediction.season < season:
            rows[prediction.bucket].append(
                (prediction.predicted_margin, prediction.actual_team_a_score)
            )
    return {name: fit_slope(group, fallback=config.fallback_slope) for name, group in rows.items()}


@dataclass(slots=True)
class _Replayed:
    game: Game
    team_a_rating: float
    team_b_rating: float
    predicted_margin: float
    bucket: str
    team_a_games_played: int
    team_b_games_played: int


def backtest(games: Iterable[Game], config: MarginConfig | None = None) -> MarginBacktestResult:
    """Predict every rateable game from earlier games, then update the ratings.

    All games on one date use the ratings of the start of that date, because kickoff times are
    not known. A game without both scores gets a prediction but does not move a rating. It still
    counts as a game played for the choice of a slope group, and it keeps the season of each team
    in the history of its program. Each team moves by its own learning weight, so the two changes
    of a game do not always cancel.
    """
    config = config or MarginConfig()
    ratings: dict[RatingKey, float] = {}
    history: defaultdict[str, dict[int, float]] = defaultdict(dict)
    games_played: defaultdict[RatingKey, int] = defaultdict(int)
    scored_games: defaultdict[RatingKey, int] = defaultdict(int)
    replayed: list[_Replayed] = []

    rateable = chronological(game for game in games if game.is_rateable)
    for _, day_iterator in groupby(rateable, key=lambda game: (game.season, game.game_date)):
        day = tuple(day_iterator)
        opening: dict[RatingKey, float] = {}
        programs: dict[RatingKey, str] = {}
        changes: defaultdict[RatingKey, float] = defaultdict(float)
        played_today: defaultdict[RatingKey, int] = defaultdict(int)
        scored_today: defaultdict[RatingKey, int] = defaultdict(int)

        for game in day:
            team_a = (game.season, game.team_a_key)
            team_b = (game.season, game.team_b_key)
            for team, program, division in (
                (team_a, game.team_a_program_id or game.team_a_key, game.team_a_division),
                (team_b, game.team_b_program_id or game.team_b_key, game.team_b_division),
            ):
                programs[team] = program
                if team not in ratings and team not in opening:
                    opening[team] = opening_rating(
                        season=game.season,
                        program_id=program,
                        division=division,
                        program_history=history,
                        config=config,
                    )
            rating_a = ratings[team_a] if team_a in ratings else opening[team_a]
            rating_b = ratings[team_b] if team_b in ratings else opening[team_b]
            predicted_margin = (
                rating_a - rating_b + config.home_edge * (game.is_team_a_home - game.is_team_b_home)
            )
            replayed.append(
                _Replayed(
                    game=game,
                    team_a_rating=rating_a,
                    team_b_rating=rating_b,
                    predicted_margin=predicted_margin,
                    bucket=bucket(
                        games_played[team_a],
                        games_played[team_b],
                        game.is_playoff_game,
                        config,
                    ),
                    team_a_games_played=games_played[team_a],
                    team_b_games_played=games_played[team_b],
                )
            )
            if game.team_a_score is not None and game.team_b_score is not None:
                margin = max(
                    -config.margin_cap,
                    min(config.margin_cap, game.team_a_score - game.team_b_score),
                )
                surprise = margin - predicted_margin
                changes[team_a] += config.learning_weight(scored_games[team_a]) * surprise
                changes[team_b] -= config.learning_weight(scored_games[team_b]) * surprise
                scored_today[team_a] += 1
                scored_today[team_b] += 1
            else:
                # A game without scores moves no rating, but its teams still get a rating and a
                # season in the history of their programs.
                changes.setdefault(team_a, 0.0)
                changes.setdefault(team_b, 0.0)
            played_today[team_a] += 1
            played_today[team_b] += 1

        for team, change in changes.items():
            ratings[team] = (ratings[team] if team in ratings else opening[team]) + change
            history[programs[team]][team[0]] = ratings[team]
        for team, count in played_today.items():
            games_played[team] += count
        for team, count in scored_today.items():
            scored_games[team] += count

    predictions, slopes = _with_probabilities(replayed, config)
    return MarginBacktestResult(
        predictions=predictions,
        ratings=dict(ratings),
        program_history={program: dict(seasons) for program, seasons in history.items()},
        games_played=dict(games_played),
        scored_games=dict(scored_games),
        slopes=slopes,
    )


def _with_probabilities(
    replayed: Sequence[_Replayed],
    config: MarginConfig,
) -> tuple[tuple[MarginPrediction, ...], dict[int, dict[str, float]]]:
    predictions: list[MarginPrediction] = []
    by_season: defaultdict[int, list[MarginPrediction]] = defaultdict(list)
    slopes: dict[int, dict[str, float]] = {}
    for season, season_rows in groupby(replayed, key=lambda row: row.game.season):
        # fit_slopes also checks the seasons. The window only keeps it from reading every
        # earlier prediction for each season.
        window = [
            prediction
            for earlier in range(season - config.slope_seasons, season)
            for prediction in by_season.get(earlier, ())
        ]
        slopes[season] = fit_slopes(window, season, config)
        for row in season_rows:
            slope = slopes[season].get(row.bucket, config.fallback_slope)
            prediction = _prediction(row, slope, is_played=True)
            predictions.append(prediction)
            by_season[season].append(prediction)
    return tuple(predictions), slopes


def predict(
    games: Iterable[Game],
    result: MarginBacktestResult,
    config: MarginConfig | None = None,
) -> tuple[MarginPrediction, ...]:
    """Predict games that the backtest did not rate, and change no rating.

    A team that has not played yet this season opens at the rating that its program history
    gives. The slopes of a season come from the slope window before it, as in the backtest.
    """
    config = config or MarginConfig()
    slopes: dict[int, Mapping[str, float]] = {}
    predictions: list[MarginPrediction] = []
    for game in chronological(games):
        if game.season not in slopes:
            if game.season in result.slopes:
                slopes[game.season] = result.slopes[game.season]
            else:
                slopes[game.season] = fit_slopes(result.predictions, game.season, config)
        team_a = (game.season, game.team_a_key)
        team_b = (game.season, game.team_b_key)
        rating_a = result.ratings.get(team_a)
        if rating_a is None:
            rating_a = opening_rating(
                season=game.season,
                program_id=game.team_a_program_id or game.team_a_key,
                division=game.team_a_division,
                program_history=result.program_history,
                config=config,
            )
        rating_b = result.ratings.get(team_b)
        if rating_b is None:
            rating_b = opening_rating(
                season=game.season,
                program_id=game.team_b_program_id or game.team_b_key,
                division=game.team_b_division,
                program_history=result.program_history,
                config=config,
            )
        played_a = result.games_played.get(team_a, 0)
        played_b = result.games_played.get(team_b, 0)
        group = bucket(played_a, played_b, game.is_playoff_game, config)
        row = _Replayed(
            game=game,
            team_a_rating=rating_a,
            team_b_rating=rating_b,
            predicted_margin=(
                rating_a - rating_b + config.home_edge * (game.is_team_a_home - game.is_team_b_home)
            ),
            bucket=group,
            team_a_games_played=played_a,
            team_b_games_played=played_b,
        )
        slope = slopes[game.season].get(group, config.fallback_slope)
        predictions.append(_prediction(row, slope, is_played=False))
    return tuple(predictions)


def _prediction(row: _Replayed, slope: float, *, is_played: bool) -> MarginPrediction:
    game = row.game
    actual_margin = None
    if is_played and game.team_a_score is not None and game.team_b_score is not None:
        actual_margin = game.team_a_score - game.team_b_score
    return MarginPrediction(
        game_key=game.game_key,
        season=game.season,
        game_date=game.game_date,
        team_a_key=game.team_a_key,
        team_a_name=game.team_a_name,
        team_b_key=game.team_b_key,
        team_b_name=game.team_b_name,
        team_a_rating=row.team_a_rating,
        team_b_rating=row.team_b_rating,
        predicted_margin=row.predicted_margin,
        team_a_win_probability=win_probability(row.predicted_margin, slope),
        actual_team_a_score=game.rateable_score if is_played else None,
        actual_margin=actual_margin,
        bucket=row.bucket,
        slope=slope,
        is_team_a_home=game.is_team_a_home,
        is_team_b_home=game.is_team_b_home,
        is_playoff_game=game.is_playoff_game,
        team_a_games_played=row.team_a_games_played,
        team_b_games_played=row.team_b_games_played,
    )
