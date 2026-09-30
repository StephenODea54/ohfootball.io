"""A rating in points that predicts the score margin of a game.

Each team has one rating for each season. The rating of team A minus the rating of team B, plus
an edge for the home team, is the margin that the model expects. After a game, each rating moves
toward the margin that the game had, with both margins kept inside a cap. A logistic curve then
turns the expected margin into a win probability.

A game against a team from another state moves the Ohio team by a share of its normal change, and
it moves a rating that the model keeps for the other team from its games against Ohio teams. Such
a game gets a prediction, but it never shapes a slope. The other team is never ranked, and its
rating appears only in the predictions of its games.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date
from itertools import groupby
from math import exp

from .games import Game, chronological
from .out_of_state import OHIO, ImpliedRatings, OpeningEstimates

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
    # The values for a game against a team from another state. The Ohio team moves by
    # other_state_weight of its normal change. A new program from another state opens at a mean
    # over other_state_window_seasons earlier seasons, shrunk with other_state_shrinkage games of
    # the mean of the division, which needs other_state_min_games games.
    other_state_weight: float = 0.5
    other_state_shrinkage: float = 20.0
    other_state_window_seasons: int = 10
    other_state_min_games: int = 30

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
        if not 0.0 <= self.other_state_weight <= 1.0:
            raise ValueError("other_state_weight must be between zero and one")
        if self.other_state_shrinkage < 0:
            raise ValueError("other_state_shrinkage cannot be negative")
        if self.other_state_window_seasons < 1:
            raise ValueError("other_state_window_seasons must be at least one")
        if self.other_state_min_games < 1:
            raise ValueError("other_state_min_games must be at least one")

    def clip_margin(self, margin: float) -> float:
        """Keep a margin inside the cap on both sides."""
        return max(-self.margin_cap, min(self.margin_cap, margin))

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
    # False for a game against a team from another state. Such a game never shapes a slope and
    # is never scored.
    is_ohio_game: bool = True


@dataclass(frozen=True, slots=True)
class OtherStateResult:
    """What the backtest knows of the teams from other states. None of it is ranked. A rating here
    appears only in the predictions of the games of the team."""

    ratings: Mapping[RatingKey, float] = field(default_factory=dict)
    program_history: ProgramHistory = field(default_factory=dict)
    games_played: Mapping[RatingKey, int] = field(default_factory=dict)
    openings: Mapping[int, OpeningEstimates] = field(default_factory=dict)
    implied: ImpliedRatings = field(default_factory=ImpliedRatings)


@dataclass(frozen=True, slots=True)
class MarginBacktestResult:
    predictions: tuple[MarginPrediction, ...]
    ratings: Mapping[RatingKey, float]
    program_history: ProgramHistory
    games_played: Mapping[RatingKey, int]
    scored_games: Mapping[RatingKey, int]
    slopes: Mapping[int, Mapping[str, float]]
    # The ratings, the history and the openings of the teams from other states. The other fields
    # hold Ohio teams only.
    other_state: OtherStateResult = field(default_factory=OtherStateResult)


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

    A season never uses its own games, so every probability in a backtest is out of sample. A game
    against a team from another state gets a probability from these slopes but never shapes them.
    """
    rows: defaultdict[str, list[tuple[float, float]]] = defaultdict(list)
    for prediction in predictions:
        if prediction.actual_team_a_score is None or not prediction.is_ohio_game:
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

    The update reads both the actual and the expected margin through the cap. A team expected to
    win by more than the cap that also wins by more than the cap is no surprise. Without the cap on
    the expected margin, such a team could only lose rating. The expected margin that gives the win
    probability is not clipped.

    A game against a team from another state is replayed in _replay_other_state_game. Every game
    must have at least one Ohio team.
    """
    config = config or MarginConfig()
    ledger = _Ledger()
    replayed: list[_Replayed] = []

    rateable = chronological(game for game in games if game.is_rateable)
    for (season, _), day_iterator in groupby(
        rateable, key=lambda game: (game.season, game.game_date)
    ):
        if season != ledger.season:
            ledger.start_season(season, config)
        day = _Day()
        for game in day_iterator:
            if game.is_ohio_game:
                replayed.append(_replay_ohio_game(game, ledger, day, config))
            elif game.is_out_of_state_game:
                row = _replay_other_state_game(game, ledger, day, config)
                if row is not None:
                    replayed.append(row)
            else:
                raise ValueError(f"game {game.game_key} has no Ohio team")
        day.apply(ledger)

    predictions, slopes = _with_probabilities(replayed, config)
    return MarginBacktestResult(
        predictions=predictions,
        ratings=dict(ledger.ratings),
        program_history={program: dict(seasons) for program, seasons in ledger.history.items()},
        games_played=dict(ledger.games_played),
        scored_games=dict(ledger.scored_games),
        slopes=slopes,
        other_state=OtherStateResult(
            ratings=dict(ledger.other_ratings),
            program_history={
                program: dict(seasons) for program, seasons in ledger.other_history.items()
            },
            games_played=dict(ledger.other_games_played),
            openings=dict(ledger.openings),
            implied=ledger.implied,
        ),
    )


@dataclass(slots=True)
class _Ledger:
    """The state of the replay between two dates."""

    ratings: dict[RatingKey, float] = field(default_factory=dict)
    history: defaultdict[str, dict[int, float]] = field(default_factory=lambda: defaultdict(dict))
    games_played: defaultdict[RatingKey, int] = field(default_factory=lambda: defaultdict(int))
    scored_games: defaultdict[RatingKey, int] = field(default_factory=lambda: defaultdict(int))
    other_ratings: dict[RatingKey, float] = field(default_factory=dict)
    other_history: defaultdict[str, dict[int, float]] = field(
        default_factory=lambda: defaultdict(dict)
    )
    other_games_played: defaultdict[RatingKey, int] = field(
        default_factory=lambda: defaultdict(int)
    )
    implied: ImpliedRatings = field(default_factory=ImpliedRatings)
    openings: dict[int, OpeningEstimates] = field(default_factory=dict)
    season: int | None = None

    def start_season(self, season: int, config: MarginConfig) -> None:
        """Fix the openings of new programs from other states for the whole season."""
        self.season = season
        self.openings[season] = self.implied.estimates(
            season,
            window_seasons=config.other_state_window_seasons,
            min_games=config.other_state_min_games,
            shrinkage=config.other_state_shrinkage,
        )


@dataclass(slots=True)
class _Day:
    """The changes of one date. They apply after every game of the date is replayed."""

    opening: dict[RatingKey, float] = field(default_factory=dict)
    programs: dict[RatingKey, str] = field(default_factory=dict)
    changes: defaultdict[RatingKey, float] = field(default_factory=lambda: defaultdict(float))
    played_today: defaultdict[RatingKey, int] = field(default_factory=lambda: defaultdict(int))
    scored_today: defaultdict[RatingKey, int] = field(default_factory=lambda: defaultdict(int))
    other_programs: dict[RatingKey, str] = field(default_factory=dict)
    other_changes: defaultdict[RatingKey, float] = field(default_factory=lambda: defaultdict(float))
    other_played_today: defaultdict[RatingKey, int] = field(
        default_factory=lambda: defaultdict(int)
    )

    def apply(self, ledger: _Ledger) -> None:
        for team, change in self.changes.items():
            ledger.ratings[team] = (
                ledger.ratings[team] if team in ledger.ratings else self.opening[team]
            ) + change
            ledger.history[self.programs[team]][team[0]] = ledger.ratings[team]
        for team, count in self.played_today.items():
            ledger.games_played[team] += count
        for team, count in self.scored_today.items():
            ledger.scored_games[team] += count
        for team, change in self.other_changes.items():
            ledger.other_ratings[team] += change
        for team, count in self.other_played_today.items():
            ledger.other_games_played[team] += count
        for team in self.other_changes:
            ledger.other_history[self.other_programs[team]][team[0]] = ledger.other_ratings[team]


def _ohio_rating(
    team: RatingKey,
    program: str,
    division: int | None,
    ledger: _Ledger,
    day: _Day,
    config: MarginConfig,
) -> float:
    """Give the rating of an Ohio team at the start of the date, and open it in its first game."""
    day.programs[team] = program
    if team not in ledger.ratings and team not in day.opening:
        day.opening[team] = opening_rating(
            season=team[0],
            program_id=program,
            division=division,
            program_history=ledger.history,
            config=config,
        )
    return ledger.ratings[team] if team in ledger.ratings else day.opening[team]


def _replay_ohio_game(game: Game, ledger: _Ledger, day: _Day, config: MarginConfig) -> _Replayed:
    team_a = (game.season, game.team_a_key)
    team_b = (game.season, game.team_b_key)
    rating_a = _ohio_rating(
        team_a, game.team_a_program_id or game.team_a_key, game.team_a_division, ledger, day, config
    )
    rating_b = _ohio_rating(
        team_b, game.team_b_program_id or game.team_b_key, game.team_b_division, ledger, day, config
    )
    predicted_margin = (
        rating_a - rating_b + config.home_edge * (game.is_team_a_home - game.is_team_b_home)
    )
    row = _Replayed(
        game=game,
        team_a_rating=rating_a,
        team_b_rating=rating_b,
        predicted_margin=predicted_margin,
        bucket=bucket(
            ledger.games_played[team_a],
            ledger.games_played[team_b],
            game.is_playoff_game,
            config,
        ),
        team_a_games_played=ledger.games_played[team_a],
        team_b_games_played=ledger.games_played[team_b],
    )
    if game.team_a_score is not None and game.team_b_score is not None:
        surprise = config.clip_margin(game.team_a_score - game.team_b_score) - config.clip_margin(
            predicted_margin
        )
        day.changes[team_a] += config.learning_weight(ledger.scored_games[team_a]) * surprise
        day.changes[team_b] -= config.learning_weight(ledger.scored_games[team_b]) * surprise
        day.scored_today[team_a] += 1
        day.scored_today[team_b] += 1
    else:
        # A game without scores moves no rating, but its teams still get a rating and a season
        # in the history of their programs.
        day.changes.setdefault(team_a, 0.0)
        day.changes.setdefault(team_b, 0.0)
    day.played_today[team_a] += 1
    day.played_today[team_b] += 1
    return row


def _replay_other_state_game(
    game: Game, ledger: _Ledger, day: _Day, config: MarginConfig
) -> _Replayed | None:
    """Replay a game between an Ohio team and a team from another state.

    The Ohio team moves by other_state_weight of its normal change, and the game counts as a game
    played and scored for it. The other team moves by its full change against the same expected
    margin. The game adds the rating that it implied for the other team to the openings of later
    seasons. A game without both scores is left out.
    """
    if game.team_a_score is None or game.team_b_score is None:
        return None
    ohio_is_a = game.team_a_state == OHIO
    if ohio_is_a:
        ohio_key, ohio_program, ohio_division = (
            game.team_a_key,
            game.team_a_program_id or game.team_a_key,
            game.team_a_division,
        )
        other_key, other_program, other_state = (
            game.team_b_key,
            game.team_b_program_id or game.team_b_key,
            game.team_b_state,
        )
        ohio_home, other_home = game.is_team_a_home, game.is_team_b_home
        margin = game.team_a_score - game.team_b_score
    else:
        ohio_key, ohio_program, ohio_division = (
            game.team_b_key,
            game.team_b_program_id or game.team_b_key,
            game.team_b_division,
        )
        other_key, other_program, other_state = (
            game.team_a_key,
            game.team_a_program_id or game.team_a_key,
            game.team_a_state,
        )
        ohio_home, other_home = game.is_team_b_home, game.is_team_a_home
        margin = game.team_b_score - game.team_a_score
    ohio = (game.season, ohio_key)
    other = (game.season, other_key)
    capped = config.clip_margin(margin)
    edge = config.home_edge * (ohio_home - other_home)
    ohio_rating = _ohio_rating(ohio, ohio_program, ohio_division, ledger, day, config)
    if other not in ledger.other_ratings:
        ledger.other_ratings[other] = _other_opening(
            game.season,
            other_program,
            other_state,
            ohio_division,
            ledger.other_history,
            ledger.openings[game.season],
            config,
        )
        ledger.other_history[other_program][game.season] = ledger.other_ratings[other]
    day.other_programs[other] = other_program
    other_rating = ledger.other_ratings[other]
    predicted = ohio_rating - other_rating + edge
    if ohio_division is not None:
        ledger.implied.record(game.season, other_state, ohio_division, ohio_rating + edge - capped)
    surprise = capped - config.clip_margin(predicted)
    ohio_played = ledger.games_played[ohio]
    other_played = ledger.other_games_played[other]
    day.changes[ohio] += (
        config.other_state_weight * config.learning_weight(ledger.scored_games[ohio]) * surprise
    )
    day.scored_today[ohio] += 1
    day.played_today[ohio] += 1
    day.other_changes[other] -= config.learning_weight(other_played) * surprise
    day.other_played_today[other] += 1

    rating_a, rating_b = (ohio_rating, other_rating) if ohio_is_a else (other_rating, ohio_rating)
    played_a, played_b = (ohio_played, other_played) if ohio_is_a else (other_played, ohio_played)
    return _Replayed(
        game=game,
        team_a_rating=rating_a,
        team_b_rating=rating_b,
        predicted_margin=(
            rating_a - rating_b + config.home_edge * (game.is_team_a_home - game.is_team_b_home)
        ),
        bucket=bucket(played_a, played_b, game.is_playoff_game, config),
        team_a_games_played=played_a,
        team_b_games_played=played_b,
    )


def _other_opening(
    season: int,
    program: str,
    state: str,
    ohio_division: int | None,
    history: ProgramHistory,
    openings: OpeningEstimates,
    config: MarginConfig,
) -> float:
    """Give the rating a team from another state opens a season with.

    A program with an earlier season against Ohio teams carries its rating by the same rule as an
    Ohio program, without a division prior. A new program opens at the learned value for its state
    and the division of its Ohio opponent.
    """
    if any(played < season for played in history.get(program, {})):
        return opening_rating(
            season=season, program_id=program, division=None, program_history=history, config=config
        )
    return openings.opening(state, ohio_division)


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
    gives. The slopes of a season come from the slope window before it, as in the backtest. A game
    against a team from another state gets a prediction too, from the rating that the backtest
    keeps for that team, or from the rating it opens with.
    """
    config = config or MarginConfig()
    slopes: dict[int, Mapping[str, float]] = {}
    predictions: list[MarginPrediction] = []
    for game in chronological(games):
        if not (game.is_ohio_game or game.is_out_of_state_game):
            raise ValueError(f"game {game.game_key} has no Ohio team")
        if game.season not in slopes:
            if game.season in result.slopes:
                slopes[game.season] = result.slopes[game.season]
            else:
                slopes[game.season] = fit_slopes(result.predictions, game.season, config)
        ohio_division = game.team_a_division if game.team_a_state == OHIO else game.team_b_division
        rating_a, played_a = _pregame(
            game.season,
            game.team_a_key,
            game.team_a_program_id or game.team_a_key,
            game.team_a_state,
            game.team_a_division,
            ohio_division,
            result,
            config,
        )
        rating_b, played_b = _pregame(
            game.season,
            game.team_b_key,
            game.team_b_program_id or game.team_b_key,
            game.team_b_state,
            game.team_b_division,
            ohio_division,
            result,
            config,
        )
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


def _pregame(
    season: int,
    team_key: str,
    program: str,
    state: str,
    division: int | None,
    ohio_division: int | None,
    result: MarginBacktestResult,
    config: MarginConfig,
) -> tuple[float, int]:
    """Give the rating and the games played of one side of an upcoming game."""
    key = (season, team_key)
    if state == OHIO:
        rating = result.ratings.get(key)
        if rating is None:
            rating = opening_rating(
                season=season,
                program_id=program,
                division=division,
                program_history=result.program_history,
                config=config,
            )
        return rating, result.games_played.get(key, 0)
    other = result.other_state
    rating = other.ratings.get(key)
    if rating is None:
        openings = other.openings.get(season) or other.implied.estimates(
            season,
            window_seasons=config.other_state_window_seasons,
            min_games=config.other_state_min_games,
            shrinkage=config.other_state_shrinkage,
        )
        rating = _other_opening(
            season, program, state, ohio_division, other.program_history, openings, config
        )
    return rating, other.games_played.get(key, 0)


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
        is_ohio_game=game.is_ohio_game,
    )
