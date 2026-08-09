"""Elo ratings and predictions for ohfootball.io."""

from .elo import BacktestResult, EloConfig, Prediction, backtest, predict
from .games import Game

__all__ = [
    "BacktestResult",
    "EloConfig",
    "Game",
    "Prediction",
    "backtest",
    "predict",
]
