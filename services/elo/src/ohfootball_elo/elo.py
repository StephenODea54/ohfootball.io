from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date
from itertools import groupby
from math import log1p

from .games import Game, chronological

RatingKey = tuple[int, str]
# The last rating a program earned, and the season it earned it in.
ProgramHistory = Mapping[str, tuple[int, float]]


@dataclass(frozen=True, slots=True)
class EloConfig:
    initial_rating: float = 1500.0
    k_factor: float = 32.0
    rating_scale: float = 400.0
    home_advantage: float = 0.0
    season_carryover: float = 0.0
    division_rating_step: float = 0.0
    margin_weight: float = 0.0
    margin_multiplier_cap: float = 2.5
    provisional_games: int = 0
    provisional_k_multiplier: float = 1.0

    def __post_init__(self) -> None:
        if self.k_factor <= 0:
            raise ValueError("k_factor must be greater than zero")
        if self.rating_scale <= 0:
            raise ValueError("rating_scale must be greater than zero")
        if self.home_advantage < 0:
            raise ValueError("home_advantage cannot be negative")
        if not 0.0 <= self.season_carryover <= 1.0:
            raise ValueError("season_carryover must be between zero and one")
        if self.division_rating_step < 0:
            raise ValueError("division_rating_step cannot be negative")
        if self.margin_weight < 0:
            raise ValueError("margin_weight cannot be negative")
        if self.margin_multiplier_cap < 1:
            raise ValueError("margin_multiplier_cap must be at least one")
        if self.provisional_games < 0:
            raise ValueError("provisional_games cannot be negative")
        if self.provisional_k_multiplier < 1:
            raise ValueError("provisional_k_multiplier must be at least one")


@dataclass(frozen=True, slots=True)
class Prediction:
    game_key: str
    season: int
    game_date: date
    team_a_key: str
    team_a_name: str
    team_b_key: str
    team_b_name: str
    team_a_rating: float
    team_b_rating: float
    team_a_win_probability: float
    actual_team_a_score: float | None
    is_team_a_home: bool = False
    is_team_b_home: bool = False
    team_a_games_played: int = 0
    team_b_games_played: int = 0
    rating_update_multiplier: float = 1.0


@dataclass(frozen=True, slots=True)
class BacktestResult:
    predictions: tuple[Prediction, ...]
    ratings: Mapping[RatingKey, float]
    program_ratings: ProgramHistory
    games_played: Mapping[RatingKey, int]


def win_probability(
    rating_a: float,
    rating_b: float,
    rating_scale: float = 400.0,
) -> float:
    """Return team A's expected score against team B."""
    return 1.0 / (1.0 + 10.0 ** ((rating_b - rating_a) / rating_scale))


def backtest(games: Iterable[Game], config: EloConfig) -> BacktestResult:
    """Predict completed games, then update ratings after each game day."""
    completed_games = chronological(game for game in games if game.is_rateable)
    ratings: dict[RatingKey, float] = {}
    program_ratings: dict[str, tuple[int, float]] = {}
    games_played: defaultdict[RatingKey, int] = defaultdict(int)
    predictions: list[Prediction] = []

    for _, daily_games_iterator in groupby(
        completed_games,
        key=lambda game: (game.season, game.game_date),
    ):
        daily_games = tuple(daily_games_iterator)
        rating_changes: defaultdict[RatingKey, float] = defaultdict(float)
        daily_start_ratings: dict[RatingKey, float] = {}
        daily_programs: dict[RatingKey, str] = {}
        daily_game_counts: defaultdict[RatingKey, int] = defaultdict(int)

        for game in daily_games:
            team_a = (game.season, game.team_a_key)
            team_b = (game.season, game.team_b_key)
            program_a = game.team_a_program_id or game.team_a_key
            program_b = game.team_b_program_id or game.team_b_key
            daily_programs[team_a] = program_a
            daily_programs[team_b] = program_b
            rating_a = _pregame_rating(
                team=team_a,
                program_id=program_a,
                division=game.team_a_division,
                ratings=ratings,
                daily_start_ratings=daily_start_ratings,
                program_ratings=program_ratings,
                config=config,
            )
            rating_b = _pregame_rating(
                team=team_b,
                program_id=program_b,
                division=game.team_b_division,
                ratings=ratings,
                daily_start_ratings=daily_start_ratings,
                program_ratings=program_ratings,
                config=config,
            )
            probability_a = win_probability(
                rating_a + config.home_advantage * game.is_team_a_home,
                rating_b + config.home_advantage * game.is_team_b_home,
                rating_scale=config.rating_scale,
            )
            actual_a = game.rateable_score
            assert actual_a is not None
            team_a_games_played = games_played[team_a]
            team_b_games_played = games_played[team_b]
            update_multiplier = rating_update_multiplier(
                game,
                config,
                team_a_games_played=team_a_games_played,
                team_b_games_played=team_b_games_played,
            )
            change_a = config.k_factor * update_multiplier * (actual_a - probability_a)

            predictions.append(
                _prediction(
                    game,
                    rating_a=rating_a,
                    rating_b=rating_b,
                    probability_a=probability_a,
                    actual_a=actual_a,
                    team_a_games_played=team_a_games_played,
                    team_b_games_played=team_b_games_played,
                    update_multiplier=update_multiplier,
                )
            )
            rating_changes[team_a] += change_a
            rating_changes[team_b] -= change_a
            daily_game_counts[team_a] += 1
            daily_game_counts[team_b] += 1

        for team, change in rating_changes.items():
            starting_rating = ratings[team] if team in ratings else daily_start_ratings[team]
            ratings[team] = starting_rating + change
            program_ratings[daily_programs[team]] = (team[0], ratings[team])
        for team, count in daily_game_counts.items():
            games_played[team] += count

    return BacktestResult(
        predictions=tuple(predictions),
        ratings=dict(ratings),
        program_ratings=dict(program_ratings),
        games_played=dict(games_played),
    )


def predict(
    games: Iterable[Game],
    ratings: Mapping[RatingKey, float],
    config: EloConfig,
    program_ratings: ProgramHistory | None = None,
    games_played: Mapping[RatingKey, int] | None = None,
) -> tuple[Prediction, ...]:
    """Predict unplayed games without changing either team's rating."""
    predictions: list[Prediction] = []
    prior_program_ratings = program_ratings or {}
    prior_games_played = games_played or {}
    for game in chronological(games):
        team_a = (game.season, game.team_a_key)
        team_b = (game.season, game.team_b_key)
        rating_a = ratings.get(
            team_a,
            initial_team_rating(
                season=game.season,
                program_id=game.team_a_program_id or game.team_a_key,
                division=game.team_a_division,
                program_ratings=prior_program_ratings,
                config=config,
            ),
        )
        rating_b = ratings.get(
            team_b,
            initial_team_rating(
                season=game.season,
                program_id=game.team_b_program_id or game.team_b_key,
                division=game.team_b_division,
                program_ratings=prior_program_ratings,
                config=config,
            ),
        )
        probability_a = win_probability(
            rating_a + config.home_advantage * game.is_team_a_home,
            rating_b + config.home_advantage * game.is_team_b_home,
            rating_scale=config.rating_scale,
        )
        predictions.append(
            _prediction(
                game,
                rating_a=rating_a,
                rating_b=rating_b,
                probability_a=probability_a,
                actual_a=None,
                team_a_games_played=prior_games_played.get(team_a, 0),
                team_b_games_played=prior_games_played.get(team_b, 0),
                update_multiplier=1.0,
            )
        )
    return tuple(predictions)


def rating_update_multiplier(
    game: Game,
    config: EloConfig,
    *,
    team_a_games_played: int = 0,
    team_b_games_played: int = 0,
) -> float:
    multiplier = provisional_update_multiplier(
        team_a_games_played,
        team_b_games_played,
        config,
    )
    if config.margin_weight == 0 or game.team_a_score is None or game.team_b_score is None:
        return multiplier
    margin = abs(game.team_a_score - game.team_b_score)
    margin_multiplier = min(
        config.margin_multiplier_cap,
        1.0 + config.margin_weight * log1p(margin),
    )
    return multiplier * margin_multiplier


def provisional_update_multiplier(
    team_a_games_played: int,
    team_b_games_played: int,
    config: EloConfig,
) -> float:
    """Return a shared, decaying early-season K boost.

    Using one multiplier for both teams preserves Elo's zero-sum rating pool.
    If either team is still provisional, the game receives the larger of the
    two teams' linearly decaying boosts.
    """
    if config.provisional_games == 0 or config.provisional_k_multiplier == 1:
        return 1.0

    def remaining_fraction(games_played: int) -> float:
        remaining_games = max(0, config.provisional_games - games_played)
        return remaining_games / config.provisional_games

    provisional_fraction = max(
        remaining_fraction(team_a_games_played),
        remaining_fraction(team_b_games_played),
    )
    return 1.0 + (config.provisional_k_multiplier - 1.0) * provisional_fraction


def _pregame_rating(
    *,
    team: RatingKey,
    program_id: str,
    division: int | None,
    ratings: Mapping[RatingKey, float],
    daily_start_ratings: dict[RatingKey, float],
    program_ratings: ProgramHistory,
    config: EloConfig,
) -> float:
    if team in ratings:
        return ratings[team]
    if team not in daily_start_ratings:
        daily_start_ratings[team] = initial_team_rating(
            season=team[0],
            program_id=program_id,
            division=division,
            program_ratings=program_ratings,
            config=config,
        )
    return daily_start_ratings[team]


def initial_team_rating(
    *,
    season: int,
    program_id: str,
    division: int | None,
    program_ratings: ProgramHistory,
    config: EloConfig,
) -> float:
    """Give the rating a team carries into its first game of a season.

    The rating comes from the most recent season the program played, which is
    not always the season before. A program that stops for one or more seasons
    and then returns keeps its last rating instead of starting again at the
    division prior.

    The carryover applies one time, whatever the length of the absence. A
    program away for four seasons regresses toward its division prior by the
    same amount as a program that played last season.
    """
    division_adjustment = (
        config.division_rating_step * (4 - division) if division is not None else 0.0
    )
    prior_rating = config.initial_rating + division_adjustment
    previous = program_ratings.get(program_id)
    if previous is None:
        return prior_rating
    previous_season, previous_rating = previous
    if previous_season >= season:
        return prior_rating
    return prior_rating + config.season_carryover * (previous_rating - prior_rating)


def _prediction(
    game: Game,
    *,
    rating_a: float,
    rating_b: float,
    probability_a: float,
    actual_a: float | None,
    team_a_games_played: int,
    team_b_games_played: int,
    update_multiplier: float,
) -> Prediction:
    return Prediction(
        game_key=game.game_key,
        season=game.season,
        game_date=game.game_date,
        team_a_key=game.team_a_key,
        team_a_name=game.team_a_name,
        team_b_key=game.team_b_key,
        team_b_name=game.team_b_name,
        team_a_rating=rating_a,
        team_b_rating=rating_b,
        team_a_win_probability=probability_a,
        actual_team_a_score=actual_a,
        is_team_a_home=game.is_team_a_home,
        is_team_b_home=game.is_team_b_home,
        team_a_games_played=team_a_games_played,
        team_b_games_played=team_b_games_played,
        rating_update_multiplier=update_multiplier,
    )
