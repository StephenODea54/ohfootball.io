"""Command-line entry points for Elo predictions and parameter sweeps."""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict, replace
from datetime import date, datetime
from typing import Iterable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .elo import EloConfig, Prediction, backtest, initial_team_rating, predict
from .games import Game
from .metrics import evaluate
from .publisher import (
    GamePredictionRow,
    RatingSnapshot,
    load_team_seasons,
    publish_predictions,
    publish_ratings,
)
from .repository import load_games
from .tracking import track_run

DEFAULT_DATABASE_URL = "postgresql://im_batman:shhhhhhhhh@localhost:5432/ohfootball"
DEFAULT_TIME_ZONE = "America/New_York"
SWEEP_PARAMETERS = (
    "k_factor",
    "rating_scale",
    "margin_multiplier_cap",
    "home_advantage",
    "season_carryover",
    "division_rating_step",
    "margin_weight",
    "provisional_games",
    "provisional_k_multiplier",
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ohfootball-elo",
        description="Backtest Elo and predict upcoming games.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    run = subparsers.add_parser("run", help="run Elo and record it in MLflow")
    _add_common_arguments(run)
    _add_config_arguments(run)
    run.add_argument("--run-name")

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

    sweep = subparsers.add_parser(
        "sweep",
        help="compare values for one Elo parameter without logging large artifacts",
    )
    _add_common_arguments(sweep)
    _add_config_arguments(sweep)
    sweep.add_argument("--parameter", choices=SWEEP_PARAMETERS, required=True)
    sweep.add_argument("--values", type=_float_values, required=True)
    sweep.add_argument("--tuning-seasons", type=_season_range, default=(2000, 2021))
    sweep.add_argument("--validation-seasons", type=_season_range, default=(2022, 2023))
    sweep.add_argument("--run-prefix")
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
        "--tracking-uri",
        default=os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5000"),
    )
    parser.add_argument(
        "--experiment-name",
        default=os.getenv("MLFLOW_EXPERIMENT_NAME", "ohfootball-elo"),
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


def _float_values(raw_values: str) -> tuple[float, ...]:
    try:
        values = tuple(float(value.strip()) for value in raw_values.split(","))
    except ValueError as error:
        raise argparse.ArgumentTypeError("values must be comma-separated numbers") from error
    if not values:
        raise argparse.ArgumentTypeError("at least one value is required")
    return values


def _season_range(raw_range: str) -> tuple[int, int]:
    try:
        start, end = (int(value) for value in raw_range.split(":", maxsplit=1))
    except ValueError as error:
        raise argparse.ArgumentTypeError("season range must look like 2000:2021") from error
    if start > end:
        raise argparse.ArgumentTypeError("season range start cannot exceed its end")
    return start, end


def main() -> None:
    arguments = build_parser().parse_args()
    if arguments.command == "run":
        _run(arguments)
    elif arguments.command == "sweep":
        _sweep(arguments)
    elif arguments.command == "publish":
        _publish(arguments)


def _run(arguments: argparse.Namespace) -> None:
    config = _config(arguments)
    games = load_games(arguments.database_url, marts_schema=arguments.marts_schema)
    training_games = _completed_games(games, arguments.as_of_date)
    if not training_games:
        raise SystemExit(f"no completed games exist before {arguments.as_of_date}")

    upcoming_games = tuple(
        game
        for game in games
        if game.is_scheduled and game.game_date >= arguments.as_of_date
    )
    result = backtest(training_games, config)
    upcoming_predictions = predict(
        upcoming_games,
        result.ratings,
        config,
        result.program_ratings,
        result.games_played,
    )
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


def _sweep(arguments: argparse.Namespace) -> None:
    base_config = _config(arguments)
    all_games = load_games(arguments.database_url, marts_schema=arguments.marts_schema)
    completed_games = _completed_games(all_games, arguments.as_of_date)
    tuning_start, tuning_end = arguments.tuning_seasons
    validation_start, validation_end = arguments.validation_seasons
    if tuning_end >= validation_start:
        raise SystemExit("tuning seasons must end before validation seasons begin")

    experiment_games = tuple(
        game for game in completed_games if game.season <= validation_end
    )
    summaries = []
    for value in arguments.values:
        parameter_value: float | int = value
        if arguments.parameter == "provisional_games":
            if not value.is_integer():
                raise SystemExit("provisional_games sweep values must be integers")
            parameter_value = int(value)
        config = replace(base_config, **{arguments.parameter: parameter_value})
        result = backtest(experiment_games, config)
        tuning_predictions = _prediction_window(
            result.predictions,
            tuning_start,
            tuning_end,
        )
        validation_predictions = _prediction_window(
            result.predictions,
            validation_start,
            validation_end,
        )
        tuning = evaluate(tuning_predictions)
        validation = evaluate(validation_predictions)
        value_label = f"{value:g}"
        prefix = arguments.run_prefix or arguments.parameter
        run_id, _ = track_run(
            tracking_uri=arguments.tracking_uri,
            experiment_name=arguments.experiment_name,
            run_name=f"{prefix}-{value_label}",
            as_of_date=arguments.as_of_date,
            config=config,
            training_games=experiment_games,
            historical_predictions=result.predictions,
            upcoming_predictions=(),
            ratings=result.ratings,
            evaluation_windows={
                "tuning": tuning_predictions,
                "validation": validation_predictions,
            },
            extra_tags={
                "run_purpose": "parameter-sweep",
                "sweep_parameter": arguments.parameter,
            },
            log_artifacts=False,
            log_per_season=False,
        )
        summaries.append(
            {
                "value": value,
                "mlflow_run_id": run_id,
                "config": asdict(config),
                "tuning": asdict(tuning),
                "validation": asdict(validation),
            }
        )

    summaries.sort(
        key=lambda summary: (
            summary["validation"]["log_loss"],
            summary["validation"]["brier_score"],
        )
    )
    print(json.dumps(summaries, indent=2, sort_keys=True))


def _publish(arguments: argparse.Namespace) -> None:
    config = _config(arguments)
    season = arguments.season or arguments.as_of_date.year
    games = load_games(arguments.database_url, marts_schema=arguments.marts_schema)
    training_games = _completed_games(games, arguments.as_of_date)
    result = backtest(training_games, config)
    teams = load_team_seasons(
        arguments.database_url,
        season=season,
        marts_schema=arguments.marts_schema,
    )
    if not teams:
        raise SystemExit(f"no Ohio teams exist for season {season}")

    snapshots = tuple(
        RatingSnapshot(
            team_key=team.team_key,
            season=season,
            as_of_date=arguments.as_of_date,
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
    published = publish_ratings(
        arguments.database_url,
        snapshots,
        marts_schema=arguments.marts_schema,
    )
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
                "season": season,
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
    return tuple(
        game for game in games if game.is_rateable and game.game_date < as_of_date
    )


def _prediction_window(
    predictions: tuple[Prediction, ...],
    first_season: int,
    last_season: int,
) -> tuple[Prediction, ...]:
    return tuple(
        prediction
        for prediction in predictions
        if first_season <= prediction.season <= last_season
    )


if __name__ == "__main__":
    main()
