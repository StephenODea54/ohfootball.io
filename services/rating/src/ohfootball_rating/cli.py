"""Command-line entry point that publishes the ratings and the predictions."""

from __future__ import annotations

import argparse
import json
import os
from collections.abc import Iterable
from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .elo import EloConfig, backtest, initial_team_rating
from .games import Game
from .publisher import (
    GamePredictionRow,
    RatingSnapshot,
    load_team_seasons,
    publish_predictions,
    publish_ratings,
)
from .repository import load_games

DEFAULT_DATABASE_URL = "postgresql://im_batman:shhhhhhhhh@localhost:5432/ohfootball"
DEFAULT_TIME_ZONE = "America/New_York"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ohfootball-rating",
        description="Publish the Elo ratings and the game predictions.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    publish = subparsers.add_parser(
        "publish",
        help="calculate and publish the production rating snapshot",
    )
    _add_common_arguments(publish)
    _add_config_arguments(publish)
    publish.add_argument("--season", type=int)
    publish.set_defaults(
        k_factor=148.0,
        home_advantage=30.0,
        season_carryover=0.85,
        division_rating_step=140.0,
        provisional_games=3,
        provisional_k_multiplier=1.6,
    )

    return parser


def _add_common_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL),
    )
    parser.add_argument(
        "--marts-schema",
        default=os.getenv("OHFOOTBALL_MARTS_SCHEMA", "ohfootball_marts"),
    )
    parser.add_argument(
        "--as-of-date",
        type=date.fromisoformat,
        default=_today_in_project_time_zone(),
    )


def _add_config_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--initial-rating", type=float, default=1500.0)
    parser.add_argument("--k-factor", type=float, default=32.0)
    parser.add_argument("--rating-scale", type=float, default=400.0)
    parser.add_argument("--home-advantage", type=float, default=0.0)
    parser.add_argument("--season-carryover", type=float, default=0.0)
    parser.add_argument("--division-rating-step", type=float, default=0.0)
    parser.add_argument("--margin-weight", type=float, default=0.0)
    parser.add_argument("--margin-multiplier-cap", type=float, default=2.5)
    parser.add_argument("--provisional-games", type=int, default=0)
    parser.add_argument("--provisional-k-multiplier", type=float, default=1.0)


def _today_in_project_time_zone() -> date:
    time_zone = os.getenv("OHFOOTBALL_TIME_ZONE", DEFAULT_TIME_ZONE)
    try:
        return datetime.now(ZoneInfo(time_zone)).date()
    except ZoneInfoNotFoundError as error:
        raise ValueError(f"invalid OHFOOTBALL_TIME_ZONE: {time_zone!r}") from error


def main() -> None:
    arguments = build_parser().parse_args()
    if arguments.command == "publish":
        _publish(arguments)


def _publish(arguments: argparse.Namespace) -> None:
    config = _config(arguments)
    current_season = arguments.season or arguments.as_of_date.year
    games = load_games(arguments.database_url, marts_schema=arguments.marts_schema)
    training_games = _completed_games(games, arguments.as_of_date)
    result = backtest(training_games, config)

    # One backtest walks the whole record and keeps the rating of every team in
    # every season. A season of the past keeps the rating it ended with, dated
    # the last day of its own year. The season in progress is dated the day of
    # the run. The publisher replaces one season and date at a time, so each
    # season needs its own call.
    published = 0
    published_seasons = 0
    seasons = {game.season for game in games if game.season <= current_season}
    for season in sorted(seasons | {current_season}):
        teams = load_team_seasons(
            arguments.database_url,
            season=season,
            marts_schema=arguments.marts_schema,
        )
        if not teams:
            continue

        snapshots = tuple(
            RatingSnapshot(
                team_key=team.team_key,
                season=season,
                as_of_date=(
                    arguments.as_of_date if season >= current_season else date(season, 12, 31)
                ),
                rating=result.ratings.get(
                    (season, team.team_key),
                    initial_team_rating(
                        season=season,
                        program_id=team.program_id,
                        division=team.division,
                        program_ratings=result.program_ratings,
                        config=config,
                    ),
                ),
            )
            for team in teams
        )
        published += publish_ratings(
            arguments.database_url,
            snapshots,
            marts_schema=arguments.marts_schema,
        )
        published_seasons += 1

    if published_seasons == 0:
        raise SystemExit("no Ohio teams exist in any season")
    # The backtest already produced a pregame prediction for every completed game. Storing them
    # lets a team page show what was expected before a game rather than recomputing it.
    published_predictions = publish_predictions(
        arguments.database_url,
        (
            GamePredictionRow(
                game_key=prediction.game_key,
                season=prediction.season,
                game_date=prediction.game_date,
                team_a_key=prediction.team_a_key,
                team_b_key=prediction.team_b_key,
                team_a_rating=prediction.team_a_rating,
                team_b_rating=prediction.team_b_rating,
                team_a_win_probability=prediction.team_a_win_probability,
            )
            for prediction in result.predictions
        ),
        marts_schema=arguments.marts_schema,
    )
    print(
        json.dumps(
            {
                "as_of_date": arguments.as_of_date.isoformat(),
                "published_predictions": published_predictions,
                "published_ratings": published,
                "published_seasons": published_seasons,
                "season": current_season,
            },
            indent=2,
            sort_keys=True,
        )
    )


def _config(arguments: argparse.Namespace) -> EloConfig:
    return EloConfig(
        initial_rating=arguments.initial_rating,
        k_factor=arguments.k_factor,
        rating_scale=arguments.rating_scale,
        home_advantage=arguments.home_advantage,
        season_carryover=arguments.season_carryover,
        division_rating_step=arguments.division_rating_step,
        margin_weight=arguments.margin_weight,
        margin_multiplier_cap=arguments.margin_multiplier_cap,
        provisional_games=arguments.provisional_games,
        provisional_k_multiplier=arguments.provisional_k_multiplier,
    )


def _completed_games(games: Iterable[Game], as_of_date: date) -> tuple[Game, ...]:
    return tuple(game for game in games if game.is_rateable and game.game_date < as_of_date)


if __name__ == "__main__":
    main()
