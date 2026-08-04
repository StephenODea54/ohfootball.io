"""Elo ratings and predictions for ohfootball.io."""

from .elo import BacktestResult, EloConfig, Game, Prediction, backtest, predict

__all__ = [
    "BacktestResult",
    "EloConfig",
    "Game",
    "Prediction",
    "backtest",
    "predict",
]
