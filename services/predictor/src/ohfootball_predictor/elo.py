"""A small, deterministic implementation of season-reset Elo."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from itertools import groupby
from typing import Iterable, Literal, Mapping

Result = Literal["W", "L", "unknown"]
RatingKey = tuple[int, str]


@dataclass(frozen=True, slots=True)
class EloConfig:
    initial_rating: float = 1500.0
    k_factor: float = 32.0
    rating_scale: float = 400.0

    def __post_init__(self) -> None:
        if self.k_factor <= 0:
            raise ValueError("k_factor must be greater than zero")
        if self.rating_scale <= 0:
            raise ValueError("rating_scale must be greater than zero")


@dataclass(frozen=True, slots=True)
class Game:
    game_key: str
    season: int
    game_date: date
    team_a_key: str
    team_a_name: str
    team_b_key: str
    team_b_name: str
    team_a_result: Result


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


@dataclass(frozen=True, slots=True)
class BacktestResult:
    predictions: tuple[Prediction, ...]
    ratings: Mapping[RatingKey, float]


def win_probability(
    rating_a: float,
    rating_b: float,
    *,
    rating_scale: float = 400.0,
) -> float:
    """Return team A's expected score against team B."""
    if rating_scale <= 0:
        raise ValueError("rating_scale must be greater than zero")
    return 1.0 / (1.0 + 10.0 ** ((rating_b - rating_a) / rating_scale))


def backtest(games: Iterable[Game], config: EloConfig) -> BacktestResult:
    """Predict completed games, then update ratings after each game day.

    All games on the same date use the ratings available at the start of that
    date. This prevents input order from creating false precision when kickoff
    times are not available.
    """
    completed_games = sorted(
        (game for game in games if game.team_a_result in ("W", "L")),
        key=lambda game: (game.season, game.game_date, game.game_key),
    )
    ratings: dict[RatingKey, float] = {}
    predictions: list[Prediction] = []

    for _, daily_games_iterator in groupby(
        completed_games,
        key=lambda game: (game.season, game.game_date),
    ):
        daily_games = tuple(daily_games_iterator)
        rating_changes: defaultdict[RatingKey, float] = defaultdict(float)

        for game in daily_games:
            team_a = (game.season, game.team_a_key)
            team_b = (game.season, game.team_b_key)
            rating_a = ratings.get(team_a, config.initial_rating)
            rating_b = ratings.get(team_b, config.initial_rating)
            probability_a = win_probability(
                rating_a,
                rating_b,
                rating_scale=config.rating_scale,
            )
            actual_a = 1.0 if game.team_a_result == "W" else 0.0
            change_a = config.k_factor * (actual_a - probability_a)

            predictions.append(
                _prediction(
                    game,
                    rating_a=rating_a,
                    rating_b=rating_b,
                    probability_a=probability_a,
                    actual_a=actual_a,
                )
            )
            rating_changes[team_a] += change_a
            rating_changes[team_b] -= change_a

        for team, change in rating_changes.items():
            ratings[team] = ratings.get(team, config.initial_rating) + change

    return BacktestResult(predictions=tuple(predictions), ratings=dict(ratings))


def predict(
    games: Iterable[Game],
    ratings: Mapping[RatingKey, float],
    config: EloConfig,
) -> tuple[Prediction, ...]:
    """Predict unplayed games without changing either team's rating."""
    predictions: list[Prediction] = []
    for game in sorted(games, key=lambda item: (item.season, item.game_date, item.game_key)):
        team_a = (game.season, game.team_a_key)
        team_b = (game.season, game.team_b_key)
        rating_a = ratings.get(team_a, config.initial_rating)
        rating_b = ratings.get(team_b, config.initial_rating)
        probability_a = win_probability(
            rating_a,
            rating_b,
            rating_scale=config.rating_scale,
        )
        predictions.append(
            _prediction(
                game,
                rating_a=rating_a,
                rating_b=rating_b,
                probability_a=probability_a,
                actual_a=None,
            )
        )
    return tuple(predictions)


def _prediction(
    game: Game,
    *,
    rating_a: float,
    rating_b: float,
    probability_a: float,
    actual_a: float | None,
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
    )
