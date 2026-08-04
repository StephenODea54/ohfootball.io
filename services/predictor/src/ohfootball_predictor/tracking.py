"""MLflow experiment tracking for Elo runs."""

from __future__ import annotations

import csv
import hashlib
import json
from collections import defaultdict
from dataclasses import asdict
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Iterable, Mapping

from .elo import EloConfig, Game, Prediction, RatingKey
from .metrics import Evaluation, evaluate


def track_run(
    *,
    tracking_uri: str,
    experiment_name: str,
    run_name: str | None,
    as_of_date: date,
    config: EloConfig,
    training_games: Iterable[Game],
    historical_predictions: tuple[Prediction, ...],
    upcoming_predictions: tuple[Prediction, ...],
    ratings: Mapping[RatingKey, float],
) -> tuple[str, Evaluation]:
    """Log one reproducible Elo run and return its MLflow ID and evaluation."""
    import mlflow

    games = tuple(training_games)
    overall = evaluate(historical_predictions)
    mlflow.set_tracking_uri(tracking_uri)
    mlflow.set_experiment(experiment_name)

    with mlflow.start_run(run_name=run_name) as run:
        mlflow.set_tags(
            {
                "algorithm": "season-reset-elo",
                "as_of_date": as_of_date.isoformat(),
                "uses_scores": "false",
                "uses_home_field": "false",
                "uses_model_registry": "false",
            }
        )
        mlflow.log_params(
            {
                **asdict(config),
                "training_games": len(games),
                "upcoming_games": len(upcoming_predictions),
                "data_fingerprint": _fingerprint(games),
            }
        )
        mlflow.log_metrics(_metrics("overall", overall))

        by_season: defaultdict[int, list[Prediction]] = defaultdict(list)
        for prediction in historical_predictions:
            by_season[prediction.season].append(prediction)
        for season, predictions in sorted(by_season.items()):
            mlflow.log_metrics(_metrics(f"season_{season}", evaluate(predictions)))

        with TemporaryDirectory(prefix="ohfootball-elo-") as directory:
            artifact_directory = Path(directory)
            _write_predictions(
                artifact_directory / "historical_predictions.csv",
                historical_predictions,
            )
            _write_predictions(
                artifact_directory / "upcoming_predictions.csv",
                upcoming_predictions,
            )
            _write_ratings(artifact_directory / "current_ratings.csv", ratings)
            (artifact_directory / "run_summary.json").write_text(
                json.dumps(
                    {
                        "as_of_date": as_of_date.isoformat(),
                        "config": asdict(config),
                        "evaluation": asdict(overall),
                        "training_games": len(games),
                        "upcoming_games": len(upcoming_predictions),
                    },
                    indent=2,
                    sort_keys=True,
                )
                + "\n",
                encoding="utf-8",
            )
            mlflow.log_artifacts(str(artifact_directory))

        return run.info.run_id, overall


def _metrics(prefix: str, evaluation: Evaluation) -> dict[str, float]:
    metrics = {
        f"{prefix}_games": float(evaluation.games),
        f"{prefix}_decided_games": float(evaluation.decided_games),
        f"{prefix}_accuracy_coverage": evaluation.accuracy_coverage,
        f"{prefix}_brier_score": evaluation.brier_score,
        f"{prefix}_log_loss": evaluation.log_loss,
    }
    if evaluation.accuracy is not None:
        metrics[f"{prefix}_accuracy"] = evaluation.accuracy
    return metrics


def _fingerprint(games: Iterable[Game]) -> str:
    digest = hashlib.sha256()
    for game in sorted(games, key=lambda item: (item.season, item.game_date, item.game_key)):
        digest.update(
            f"{game.game_key}|{game.season}|{game.game_date}|{game.team_a_result}\n".encode()
        )
    return digest.hexdigest()


def _write_predictions(path: Path, predictions: Iterable[Prediction]) -> None:
    columns = (
        "game_key",
        "season",
        "game_date",
        "team_a_key",
        "team_a_name",
        "team_b_key",
        "team_b_name",
        "team_a_rating",
        "team_b_rating",
        "team_a_win_probability",
        "actual_team_a_score",
    )
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=columns)
        writer.writeheader()
        for prediction in predictions:
            row = asdict(prediction)
            row["game_date"] = prediction.game_date.isoformat()
            writer.writerow(row)


def _write_ratings(path: Path, ratings: Mapping[RatingKey, float]) -> None:
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(("season", "team_key", "rating"))
        for (season, team_key), rating in sorted(ratings.items()):
            writer.writerow((season, team_key, rating))
