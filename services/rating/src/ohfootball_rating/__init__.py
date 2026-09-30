"""The margin rating and its predictions for ohfootball.io."""

from .games import Game
from .margin import MarginBacktestResult, MarginConfig, MarginPrediction, backtest, predict

__all__ = [
    "Game",
    "MarginBacktestResult",
    "MarginConfig",
    "MarginPrediction",
    "backtest",
    "predict",
]
