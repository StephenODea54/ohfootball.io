"""Command-line entry points that publish the ratings and score the margin rating."""

from __future__ import annotations

import argparse
import json
import os
from collections.abc import Iterable, Sequence
from dataclasses import asdict
from datetime import date, datetime
from pathlib import Path
from statistics import median
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .games import Game
from .margin import MarginConfig, MarginPrediction, backtest, opening_rating, predict
from .metrics import evaluate
from .publisher import (
    GamePredictionRow,
    RatingSnapshot,
    load_team_seasons,
    publish_predictions,
    publish_ratings,
)
from .repository import load_games, load_games_from_export

DEFAULT_DATABASE_URL = "postgresql://im_batman:shhhhhhhhh@localhost:5432/ohfootball"
DEFAULT_TIME_ZONE = "America/New_York"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ohfootball-rating",
        description="Publish and score the margin rating.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    publish = subparsers.add_parser(
        "publish",
        help="calculate and publish the ratings and the predictions",
    )
    _add_common_arguments(publish)
    publish.add_argument("--season", type=int)

    scoring = subparsers.add_parser(
        "evaluate",
        help="score the margin rating on past seasons and print the result",
    )
    _add_common_arguments(scoring)
    scoring.add_argument(
        "--export-dir",
        type=Path,
        help="read dim_teams.csv and fct_games.csv of a dataset export instead of the warehouse",
    )
    scoring.add_argument(
        "--windows",
        type=_season_range,
        default=(2000, 2023),
        help="the seasons to score in windows, as FIRST:LAST (default 2000:2023)",
    )
    scoring.add_argument(
        "--window-size",
        type=int,
        default=2,
        help="the number of seasons in each window (default 2)",
    )
    scoring.add_argument(
        "--holdout",
        type=_season_range,
        default=(2024, 2025),
        help="the seasons to score apart from the windows, as FIRST:LAST (default 2024:2025)",
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


def _today_in_project_time_zone() -> date:
    time_zone = os.getenv("OHFOOTBALL_TIME_ZONE", DEFAULT_TIME_ZONE)
    try:
        return datetime.now(ZoneInfo(time_zone)).date()
    except ZoneInfoNotFoundError as error:
        raise ValueError(f"invalid OHFOOTBALL_TIME_ZONE: {time_zone!r}") from error


def _season_range(raw_range: str) -> tuple[int, int]:
    try:
        start, end = (int(value) for value in raw_range.split(":", maxsplit=1))
    except ValueError as error:
        raise argparse.ArgumentTypeError("a season range must look like 2000:2023") from error
    if start > end:
        raise argparse.ArgumentTypeError("the first season of a range cannot follow the last")
    return start, end


def main() -> None:
    arguments = build_parser().parse_args()
    commands = {"publish": _publish, "evaluate": _evaluate}
    commands[arguments.command](arguments)


def _publish(arguments: argparse.Namespace) -> None:
    config = MarginConfig()
    current_season = arguments.season or arguments.as_of_date.year
    games = load_games(arguments.database_url, marts_schema=arguments.marts_schema)
    completed = _completed_games(games, arguments.as_of_date)
    result = backtest(completed, config)

    # One backtest walks the whole record and keeps the rating of every team in every season. A
    # season of the past keeps the rating it ended with, dated the last day of its own year. The
    # season in progress is dated the day of the run. The publisher replaces one season and date
    # at a time, so each season needs its own call. A team without a game yet gets the rating it
    # opens the season with.
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

        ratings = {
            team.team_key: result.ratings.get(
                (season, team.team_key),
                opening_rating(
                    season=season,
                    program_id=team.program_id,
                    division=team.division,
                    program_history=result.program_history,
                    config=config,
                ),
            )
            for team in teams
        }
        middle = median(ratings.values())
        as_of_date = arguments.as_of_date if season >= current_season else date(season, 12, 31)
        published += publish_ratings(
            arguments.database_url,
            (
                RatingSnapshot(
                    team_key=team_key,
                    season=season,
                    as_of_date=as_of_date,
                    rating=rating,
                    relative_rating=rating - middle,
                )
                for team_key, rating in ratings.items()
            ),
            marts_schema=arguments.marts_schema,
        )
        published_seasons += 1

    if published_seasons == 0:
        raise SystemExit("no Ohio teams exist in any season")

    # The backtest gave a prediction for every completed game, made before its result was known.
    # Games of the season in progress that were not played before the day of the run get a
    # prediction from the current ratings. A game of a past season that never got a result gets
    # none, because the ratings of that season already hold the games after it. Storing the
    # predictions lets a team page show what was expected before each game.
    upcoming = predict(
        (
            game
            for game in games
            if (game.is_scheduled and game.season >= current_season)
            or (game.is_rateable and game.game_date >= arguments.as_of_date)
        ),
        result,
        config,
    )
    rows = [_prediction_row(item, item.game_date) for item in result.predictions]
    rows += [_prediction_row(item, arguments.as_of_date) for item in upcoming]
    published_predictions = publish_predictions(
        arguments.database_url,
        rows,
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
                "upcoming_predictions": len(upcoming),
            },
            indent=2,
            sort_keys=True,
        )
    )


def _prediction_row(prediction: MarginPrediction, as_of_date: date) -> GamePredictionRow:
    return GamePredictionRow(
        game_key=prediction.game_key,
        season=prediction.season,
        game_date=prediction.game_date,
        team_a_key=prediction.team_a_key,
        team_b_key=prediction.team_b_key,
        team_a_rating=prediction.team_a_rating,
        team_b_rating=prediction.team_b_rating,
        team_a_win_probability=prediction.team_a_win_probability,
        predicted_margin=prediction.predicted_margin,
        as_of_date=as_of_date,
    )


def _evaluate(arguments: argparse.Namespace) -> None:
    first, last = arguments.windows
    holdout_first, holdout_last = arguments.holdout
    if arguments.window_size < 1 or (last - first + 1) % arguments.window_size:
        raise SystemExit("the window size must divide the range of the windows")
    if holdout_first <= last:
        raise SystemExit("the holdout must start after the last window")
    if arguments.export_dir is not None:
        games = load_games_from_export(arguments.export_dir)
    else:
        games = load_games(arguments.database_url, marts_schema=arguments.marts_schema)
    completed = _completed_games(games, arguments.as_of_date)
    if not completed:
        raise SystemExit(f"no completed games exist before {arguments.as_of_date}")

    config = MarginConfig()
    result = backtest(completed, config)
    windows = [
        (start, start + arguments.window_size - 1)
        for start in range(first, last + 1, arguments.window_size)
    ]
    report: dict[str, object] = {
        "as_of_date": arguments.as_of_date.isoformat(),
        "config": asdict(config),
        "games": len(result.predictions),
        "windows": [
            {"seasons": [start, end], **scored}
            for start, end in windows
            if (scored := _score(result.predictions, start, end)) is not None
        ],
        "pooled": _score(result.predictions, first, last),
        "holdout": _score(result.predictions, holdout_first, holdout_last),
    }
    latest = max(result.slopes)
    report["slopes"] = {"season": latest, "by_group": result.slopes[latest]}
    print(json.dumps(report, indent=2, sort_keys=True))


def _score(
    predictions: Sequence[MarginPrediction], first: int, last: int
) -> dict[str, object] | None:
    chosen = [item for item in predictions if first <= item.season <= last]
    return asdict(evaluate(chosen)) if chosen else None


def _completed_games(games: Iterable[Game], as_of_date: date) -> tuple[Game, ...]:
    return tuple(game for game in games if game.is_rateable and game.game_date < as_of_date)


if __name__ == "__main__":
    main()
