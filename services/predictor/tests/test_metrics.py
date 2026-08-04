from datetime import date
import unittest

from ohfootball_predictor.elo import Prediction
from ohfootball_predictor.metrics import evaluate


def prediction(probability: float, actual: float) -> Prediction:
    return Prediction(
        game_key=str(probability),
        season=2025,
        game_date=date(2025, 8, 1),
        team_a_key="a",
        team_a_name="A",
        team_b_key="b",
        team_b_name="B",
        team_a_rating=1500,
        team_b_rating=1500,
        team_a_win_probability=probability,
        actual_team_a_score=actual,
    )


class EvaluationTests(unittest.TestCase):
    def test_perfect_forecasts_have_perfect_brier_and_accuracy(self) -> None:
        result = evaluate((prediction(1.0, 1.0), prediction(0.0, 0.0)))

        self.assertEqual(result.accuracy, 1.0)
        self.assertEqual(result.accuracy_coverage, 1.0)
        self.assertEqual(result.brier_score, 0.0)
        self.assertLess(result.log_loss, 1e-10)

    def test_even_forecast_is_not_counted_as_a_decision(self) -> None:
        result = evaluate((prediction(0.5, 1.0),))

        self.assertIsNone(result.accuracy)
        self.assertEqual(result.accuracy_coverage, 0.0)
        self.assertEqual(result.brier_score, 0.25)


if __name__ == "__main__":
    unittest.main()
