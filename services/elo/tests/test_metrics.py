import unittest
from datetime import date

from ohfootball_elo.elo import Prediction
from ohfootball_elo.metrics import evaluate


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

    def test_a_tie_is_scored_but_is_not_a_decision(self) -> None:
        result = evaluate((prediction(0.75, 1.0), prediction(0.75, 0.5)))

        self.assertEqual(result.games, 2)
        self.assertEqual(result.decided_games, 1)
        self.assertEqual(result.accuracy, 1.0)
        self.assertEqual(result.accuracy_coverage, 0.5)
        self.assertAlmostEqual(result.brier_score, 0.0625)

    def test_a_tie_never_makes_a_pick_look_correct(self) -> None:
        # A tie has no winner. Before ties were rated, this forecast scored as
        # a correct pick, because the underdog did not win.
        result = evaluate((prediction(0.25, 0.5),))

        self.assertIsNone(result.accuracy)
        self.assertEqual(result.decided_games, 0)
        self.assertEqual(result.games, 1)

    def test_a_tie_costs_more_when_the_forecast_was_confident(self) -> None:
        confident = evaluate((prediction(0.9, 0.5),))
        even = evaluate((prediction(0.5, 0.5),))

        self.assertGreater(confident.brier_score, even.brier_score)
        self.assertGreater(confident.log_loss, even.log_loss)
        self.assertEqual(even.brier_score, 0.0)


if __name__ == "__main__":
    unittest.main()
