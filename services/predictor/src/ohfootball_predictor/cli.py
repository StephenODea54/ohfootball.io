"""Command-line entry point for Elo backtests and upcoming predictions."""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict
from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .elo import EloConfig, backtest, predict
from .repository import load_games
from .tracking import track_run

DEFAULT_DATABASE_URL = "postgresql://im_batman:shhhhhhhhh@localhost:5432/ohfootball"
DEFAULT_TIME_ZONE = "America/New_York"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ohfootball-elo",
        description="Backtest season-reset Elo and predict upcoming games.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    run = subparsers.add_parser("run", help="run Elo and record the experiment in MLflow")
    run.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL),
    )
    run.add_argument(
        "--marts-schema",
        default=os.getenv("OHFOOTBALL_MARTS_SCHEMA", "ohfootball_marts"),
    )
    run.add_argument(
        "--tracking-uri",
        default=os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5000"),
    )
    run.add_argument(
        "--experiment-name",
        default=os.getenv("MLFLOW_EXPERIMENT_NAME", "ohfootball-elo"),
    )
    run.add_argument("--run-name")
    run.add_argument(
        "--as-of-date",
        type=date.fromisoformat,
        default=_today_in_project_time_zone(),
    )
    run.add_argument("--initial-rating", type=float, default=1500.0)
    run.add_argument("--k-factor", type=float, default=32.0)
    run.add_argument("--rating-scale", type=float, default=400.0)
    return parser


def _today_in_project_time_zone() -> date:
    time_zone = os.getenv("OHFOOTBALL_TIME_ZONE", DEFAULT_TIME_ZONE)
    try:
        return datetime.now(ZoneInfo(time_zone)).date()
    except ZoneInfoNotFoundError as error:
        raise ValueError(f"invalid OHFOOTBALL_TIME_ZONE: {time_zone!r}") from error


def main() -> None:
    arguments = build_parser().parse_args()
    if arguments.command == "run":
        _run(arguments)


def _run(arguments: argparse.Namespace) -> None:
    config = EloConfig(
        initial_rating=arguments.initial_rating,
        k_factor=arguments.k_factor,
        rating_scale=arguments.rating_scale,
    )
    games = load_games(arguments.database_url, marts_schema=arguments.marts_schema)
    training_games = tuple(
        game
        for game in games
        if game.team_a_result in ("W", "L") and game.game_date < arguments.as_of_date
    )
    if not training_games:
        raise SystemExit(f"no completed games exist before {arguments.as_of_date}")

    upcoming_games = tuple(
        game
        for game in games
        if game.team_a_result == "unknown" and game.game_date >= arguments.as_of_date
    )
    result = backtest(training_games, config)
    upcoming_predictions = predict(upcoming_games, result.ratings, config)
    run_id, evaluation = track_run(
        tracking_uri=arguments.tracking_uri,
        experiment_name=arguments.experiment_name,
        run_name=arguments.run_name,
        as_of_date=arguments.as_of_date,
        config=config,
        training_games=training_games,
        historical_predictions=result.predictions,
        upcoming_predictions=upcoming_predictions,
        ratings=result.ratings,
    )
    print(
        json.dumps(
            {
                "mlflow_run_id": run_id,
                "training_games": len(training_games),
                "upcoming_games": len(upcoming_predictions),
                "evaluation": asdict(evaluation),
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
