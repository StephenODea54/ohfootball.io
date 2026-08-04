from datetime import date
import unittest

from ohfootball_predictor.elo import EloConfig, Game, backtest, predict, win_probability


def game(
    game_key: str,
    game_date: date,
    team_a: str,
    team_b: str,
    result: str,
    *,
    season: int = 2025,
) -> Game:
    return Game(
        game_key=game_key,
        season=season,
        game_date=game_date,
        team_a_key=team_a,
        team_a_name=team_a,
        team_b_key=team_b,
        team_b_name=team_b,
        team_a_result=result,
    )


class WinProbabilityTests(unittest.TestCase):
    def test_equal_ratings_are_even(self) -> None:
        self.assertEqual(win_probability(1500, 1500), 0.5)

    def test_probability_is_symmetric(self) -> None:
        probability_a = win_probability(1600, 1450)
        probability_b = win_probability(1450, 1600)
        self.assertAlmostEqual(probability_a + probability_b, 1.0)


class BacktestTests(unittest.TestCase):
    def test_prediction_is_recorded_before_rating_update(self) -> None:
        result = backtest(
            [
                game("one", date(2025, 8, 1), "a", "b", "W"),
                game("two", date(2025, 8, 8), "a", "b", "W"),
            ],
            EloConfig(),
        )

        self.assertEqual(result.predictions[0].team_a_win_probability, 0.5)
        self.assertGreater(result.predictions[1].team_a_win_probability, 0.5)
        self.assertAlmostEqual(result.ratings[(2025, "a")], 1530.5304984710244)
        self.assertAlmostEqual(result.ratings[(2025, "b")], 1469.4695015289756)

    def test_same_day_games_use_start_of_day_ratings(self) -> None:
        result = backtest(
            [
                game("one", date(2025, 8, 1), "a", "b", "W"),
                game("two", date(2025, 8, 1), "a", "c", "W"),
            ],
            EloConfig(),
        )

        self.assertEqual(result.predictions[0].team_a_win_probability, 0.5)
        self.assertEqual(result.predictions[1].team_a_win_probability, 0.5)
        self.assertEqual(result.ratings[(2025, "a")], 1532.0)

    def test_ratings_reset_between_seasons(self) -> None:
        result = backtest(
            [
                game("one", date(2024, 8, 1), "a", "b", "W", season=2024),
                game("two", date(2025, 8, 1), "a", "b", "W", season=2025),
            ],
            EloConfig(),
        )

        self.assertEqual(result.predictions[1].team_a_win_probability, 0.5)

    def test_unplayed_games_do_not_change_ratings(self) -> None:
        result = backtest(
            [
                game("played", date(2025, 8, 1), "a", "b", "W"),
                game("future", date(2025, 8, 8), "a", "b", "unknown"),
            ],
            EloConfig(),
        )
        ratings_before = dict(result.ratings)
        predictions = predict(
            [game("future", date(2025, 8, 8), "a", "b", "unknown")],
            result.ratings,
            EloConfig(),
        )

        self.assertGreater(predictions[0].team_a_win_probability, 0.5)
        self.assertEqual(result.ratings, ratings_before)

    def test_rating_points_are_conserved(self) -> None:
        config = EloConfig()
        result = backtest(
            [game("one", date(2025, 8, 1), "a", "b", "W")],
            config,
        )

        self.assertEqual(
            result.ratings[(2025, "a")] + result.ratings[(2025, "b")],
            config.initial_rating * 2,
        )


if __name__ == "__main__":
    unittest.main()
