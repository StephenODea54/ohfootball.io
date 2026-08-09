"""Dependency-free metrics for Elo probability forecasts."""

from __future__ import annotations

from dataclasses import dataclass
from math import log
from typing import Iterable

from .elo import Prediction


@dataclass(frozen=True, slots=True)
class Evaluation:
    """Scores for a set of forecasts.

    `games` counts every scored game. `decided_games` counts only the games
    that the accuracy can speak about: the game had a winner and the forecast
    picked a team.
    """

    games: int
    decided_games: int
    accuracy: float | None
    accuracy_coverage: float
    brier_score: float
    log_loss: float


def evaluate(predictions: Iterable[Prediction]) -> Evaluation:
    scored = tuple(
        prediction
        for prediction in predictions
        if prediction.actual_team_a_score is not None
    )
    if not scored:
        raise ValueError("at least one completed prediction is required")

    squared_errors = 0.0
    losses = 0.0
    correct = 0
    decided = 0

    for prediction in scored:
        probability = prediction.team_a_win_probability
        actual = prediction.actual_team_a_score
        assert actual is not None
        squared_errors += (probability - actual) ** 2

        clipped_probability = min(max(probability, 1e-15), 1.0 - 1e-15)
        losses -= actual * log(clipped_probability) + (1.0 - actual) * log(
            1.0 - clipped_probability
        )

        # A tie has no winner, so it can neither agree nor disagree with a
        # pick. It stays in the Brier score and the log loss, which measure
        # the probability, but it leaves the accuracy on both sides of the
        # fraction. An even forecast picks no team, so it also leaves.
        if probability != 0.5 and actual != 0.5:
            decided += 1
            correct += int((probability > 0.5) == (actual == 1.0))

    games = len(scored)
    return Evaluation(
        games=games,
        decided_games=decided,
        accuracy=correct / decided if decided else None,
        accuracy_coverage=decided / games,
        brier_score=squared_errors / games,
        log_loss=losses / games,
    )
