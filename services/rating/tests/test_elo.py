import unittest
from dataclasses import replace
from datetime import date

from ohfootball_rating.elo import (
    EloConfig,
    Game,
    backtest,
    predict,
    provisional_update_multiplier,
    rating_update_multiplier,
    win_probability,
)


def game(
    game_key: str,
    game_date: date,
    team_a: str,
    team_b: str,
    result: str,
    *,
    season: int = 2025,
    team_a_program_id: str | None = None,
    team_b_program_id: str | None = None,
    team_a_division: int | None = None,
    team_b_division: int | None = None,
    is_team_a_home: bool = False,
    is_team_b_home: bool = False,
    team_a_score: int | None = None,
    team_b_score: int | None = None,
    notes: str | None = None,
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
        team_a_program_id=team_a_program_id,
        team_b_program_id=team_b_program_id,
        team_a_division=team_a_division,
        team_b_division=team_b_division,
        is_team_a_home=is_team_a_home,
        is_team_b_home=is_team_b_home,
        team_a_score=team_a_score,
        team_b_score=team_b_score,
        notes=notes,
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

    def test_a_tie_between_equal_teams_changes_nothing(self) -> None:
        result = backtest(
            [game("one", date(2025, 8, 1), "a", "b", "T")],
            EloConfig(),
        )

        self.assertEqual(result.predictions[0].actual_team_a_score, 0.5)
        self.assertEqual(result.ratings[(2025, "a")], 1500.0)
        self.assertEqual(result.ratings[(2025, "b")], 1500.0)

    def test_a_tie_moves_the_favorite_toward_the_underdog(self) -> None:
        result = backtest(
            [
                game("one", date(2025, 8, 1), "a", "b", "W"),
                game("two", date(2025, 8, 8), "a", "b", "T"),
            ],
            EloConfig(),
        )

        rating_after_the_win = 1516.0
        self.assertLess(result.ratings[(2025, "a")], rating_after_the_win)
        self.assertGreater(result.ratings[(2025, "a")], 1500.0)
        self.assertAlmostEqual(result.ratings[(2025, "a")] + result.ratings[(2025, "b")], 3000.0)

    def test_a_forfeit_does_not_change_a_rating(self) -> None:
        result = backtest(
            [game("one", date(2025, 8, 1), "a", "b", "W", notes="forfeit")],
            EloConfig(),
        )

        self.assertEqual(result.ratings, {})

    def test_a_double_forfeit_does_not_change_a_rating(self) -> None:
        result = backtest(
            [game("one", date(2025, 8, 1), "a", "b", "L", notes="double forfeit")],
            EloConfig(),
        )

        self.assertEqual(result.ratings, {})

    def test_a_canceled_game_does_not_change_a_rating(self) -> None:
        result = backtest(
            [game("one", date(2025, 8, 1), "a", "b", "C")],
            EloConfig(),
        )

        self.assertEqual(result.ratings, {})

    def test_an_overtime_note_still_rates_the_game(self) -> None:
        result = backtest(
            [game("one", date(2025, 8, 1), "a", "b", "W", notes="overtime")],
            EloConfig(),
        )

        self.assertEqual(result.ratings[(2025, "a")], 1516.0)

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

    def test_carries_program_rating_into_the_next_season(self) -> None:
        result = backtest(
            [
                game(
                    "one",
                    date(2024, 8, 1),
                    "2024-a",
                    "2024-b",
                    "W",
                    season=2024,
                    team_a_program_id="a",
                    team_b_program_id="b",
                ),
                game(
                    "two",
                    date(2025, 8, 1),
                    "2025-a",
                    "2025-b",
                    "W",
                    season=2025,
                    team_a_program_id="a",
                    team_b_program_id="b",
                ),
            ],
            EloConfig(season_carryover=0.5),
        )

        self.assertEqual(result.predictions[1].team_a_rating, 1508.0)
        self.assertEqual(result.predictions[1].team_b_rating, 1492.0)
        self.assertGreater(result.predictions[1].team_a_win_probability, 0.5)

    def _returning_program_rating(
        self,
        return_season: int,
        config: EloConfig,
        *,
        return_division: int | None = None,
        first_division: int | None = None,
    ) -> float:
        result = backtest(
            [
                game(
                    "first",
                    date(2020, 8, 1),
                    "2020-a",
                    "2020-b",
                    "W",
                    season=2020,
                    team_a_program_id="a",
                    team_b_program_id="b",
                    team_a_division=first_division,
                    team_b_division=first_division,
                ),
                game(
                    "return",
                    date(return_season, 8, 1),
                    f"{return_season}-a",
                    f"{return_season}-b",
                    "W",
                    season=return_season,
                    team_a_program_id="a",
                    team_b_program_id="b",
                    team_a_division=return_division,
                    team_b_division=first_division,
                ),
            ],
            config,
        )
        return result.predictions[1].team_a_rating

    def test_a_program_that_misses_seasons_keeps_its_last_rating(self) -> None:
        config = EloConfig(season_carryover=0.5)

        # The program last played in 2020 and returns in 2024. It carries the
        # 1516 rating it earned, rather than starting again at 1500.
        self.assertEqual(self._returning_program_rating(2024, config), 1508.0)

    def test_the_carryover_does_not_compound_over_a_long_absence(self) -> None:
        config = EloConfig(season_carryover=0.5)

        after_one_season = self._returning_program_rating(2021, config)
        after_four_seasons = self._returning_program_rating(2024, config)

        self.assertEqual(after_one_season, after_four_seasons)

    def test_a_returning_program_regresses_toward_its_new_division(self) -> None:
        config = EloConfig(season_carryover=0.5, division_rating_step=10)

        # The program played in division 1 in 2020 and returns in division 7.
        # It finished 2020 at 1546 and the division 7 prior is 1470.
        rating = self._returning_program_rating(2024, config, first_division=1, return_division=7)

        self.assertEqual(rating, 1508.0)

    def test_a_program_without_history_starts_at_its_division_prior(self) -> None:
        config = EloConfig(season_carryover=0.5, division_rating_step=10)
        result = backtest(
            [
                game(
                    "one",
                    date(2024, 8, 1),
                    "a",
                    "b",
                    "W",
                    season=2024,
                    team_a_program_id="never-played",
                    team_b_program_id="b",
                    team_a_division=7,
                )
            ],
            config,
        )

        self.assertEqual(result.predictions[0].team_a_rating, 1470.0)

    def test_applies_division_prior_to_a_new_team(self) -> None:
        result = backtest(
            [
                game(
                    "one",
                    date(2025, 8, 1),
                    "a",
                    "b",
                    "W",
                    team_a_division=1,
                    team_b_division=7,
                )
            ],
            EloConfig(division_rating_step=10),
        )

        self.assertEqual(result.predictions[0].team_a_rating, 1530.0)
        self.assertEqual(result.predictions[0].team_b_rating, 1470.0)

    def test_carryover_regresses_toward_division_prior_without_compounding(self) -> None:
        config = EloConfig(season_carryover=0.5, division_rating_step=10)
        result = backtest(
            [
                game(
                    "one",
                    date(2024, 8, 1),
                    "2024-a",
                    "2024-b",
                    "W",
                    season=2024,
                    team_a_program_id="a",
                    team_b_program_id="b",
                    team_a_division=1,
                    team_b_division=7,
                ),
                game(
                    "two",
                    date(2025, 8, 1),
                    "2025-a",
                    "2025-b",
                    "W",
                    season=2025,
                    team_a_program_id="a",
                    team_b_program_id="b",
                    team_a_division=1,
                    team_b_division=7,
                ),
            ],
            config,
        )

        prior = 1530.0
        expected = prior + 0.5 * (result.ratings[(2024, "2024-a")] - prior)
        self.assertAlmostEqual(result.predictions[1].team_a_rating, expected)

    def test_home_advantage_changes_probability_not_stored_rating(self) -> None:
        result = backtest(
            [
                game(
                    "one",
                    date(2025, 8, 1),
                    "a",
                    "b",
                    "W",
                    is_team_a_home=True,
                )
            ],
            EloConfig(home_advantage=30),
        )

        self.assertEqual(result.predictions[0].team_a_rating, 1500.0)
        self.assertGreater(result.predictions[0].team_a_win_probability, 0.5)

    def test_an_unplayed_game_is_predicted_from_the_current_ratings(self) -> None:
        result = backtest(
            [game("played", date(2025, 8, 1), "a", "b", "W")],
            EloConfig(),
        )
        predictions = predict(
            [game("future", date(2025, 8, 8), "a", "b", "unknown")],
            result.ratings,
            EloConfig(),
        )

        self.assertGreater(predictions[0].team_a_win_probability, 0.5)

    def test_upcoming_prediction_reports_games_already_played(self) -> None:
        config = EloConfig(provisional_games=4, provisional_k_multiplier=1.5)
        result = backtest(
            [game("played", date(2025, 8, 1), "a", "b", "W")],
            config,
        )
        predictions = predict(
            [game("future", date(2025, 8, 8), "a", "b", "unknown")],
            result.ratings,
            config,
            result.program_ratings,
            result.games_played,
        )

        self.assertEqual(predictions[0].team_a_games_played, 1)
        self.assertEqual(predictions[0].team_b_games_played, 1)

    def test_upcoming_game_uses_prior_season_program_rating(self) -> None:
        config = EloConfig(season_carryover=0.5)
        result = backtest(
            [
                game(
                    "played",
                    date(2024, 8, 1),
                    "2024-a",
                    "2024-b",
                    "W",
                    season=2024,
                    team_a_program_id="a",
                    team_b_program_id="b",
                )
            ],
            config,
        )
        predictions = predict(
            [
                game(
                    "future",
                    date(2025, 8, 1),
                    "2025-a",
                    "2025-b",
                    "unknown",
                    season=2025,
                    team_a_program_id="a",
                    team_b_program_id="b",
                )
            ],
            result.ratings,
            config,
            result.program_ratings,
        )

        self.assertEqual(predictions[0].team_a_rating, 1508.0)
        self.assertEqual(predictions[0].team_b_rating, 1492.0)

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

    def test_the_playoff_flag_changes_no_prediction_or_rating(self) -> None:
        config = EloConfig(k_factor=148, home_advantage=30, season_carryover=0.85)
        games = [
            game("one", date(2024, 8, 1), "a", "b", "W", season=2024, is_team_a_home=True),
            game("two", date(2024, 11, 1), "a", "c", "L", season=2024),
            game("three", date(2025, 8, 1), "b", "c", "W", season=2025, team_b_program_id="c"),
        ]
        playoffs = [replace(item, is_playoff_game=item.game_key != "one") for item in games]

        plain = backtest(games, config)
        flagged = backtest(playoffs, config)

        self.assertEqual(plain.predictions, flagged.predictions)
        self.assertEqual(plain.ratings, flagged.ratings)
        self.assertEqual(plain.program_ratings, flagged.program_ratings)

    def test_provisional_k_boost_decays_with_games_played(self) -> None:
        config = EloConfig(provisional_games=4, provisional_k_multiplier=2.0)

        self.assertEqual(provisional_update_multiplier(0, 0, config), 2.0)
        self.assertEqual(provisional_update_multiplier(2, 4, config), 1.5)
        self.assertEqual(provisional_update_multiplier(4, 8, config), 1.0)

    def test_provisional_games_use_one_zero_sum_multiplier(self) -> None:
        config = EloConfig(provisional_games=1, provisional_k_multiplier=2.0)
        result = backtest(
            [
                game("one", date(2025, 8, 1), "a", "b", "W"),
                game("two", date(2025, 8, 8), "a", "b", "W"),
            ],
            config,
        )

        self.assertEqual(result.predictions[0].rating_update_multiplier, 2.0)
        self.assertEqual(result.predictions[1].rating_update_multiplier, 1.0)
        self.assertEqual(
            result.ratings[(2025, "a")] + result.ratings[(2025, "b")],
            config.initial_rating * 2,
        )

    def test_margin_multiplier_is_logarithmic_and_capped(self) -> None:
        close_game = game(
            "close",
            date(2025, 8, 1),
            "a",
            "b",
            "W",
            team_a_score=21,
            team_b_score=20,
        )
        blowout = game(
            "blowout",
            date(2025, 8, 2),
            "a",
            "b",
            "W",
            team_a_score=70,
            team_b_score=0,
        )
        config = EloConfig(margin_weight=0.5, margin_multiplier_cap=2.0)

        self.assertGreater(rating_update_multiplier(close_game, config), 1.0)
        self.assertEqual(rating_update_multiplier(blowout, config), 2.0)

    def test_missing_score_uses_standard_update(self) -> None:
        unscored_game = game("forfeit", date(2025, 8, 1), "a", "b", "W")

        self.assertEqual(
            rating_update_multiplier(unscored_game, EloConfig(margin_weight=0.5)),
            1.0,
        )


if __name__ == "__main__":
    unittest.main()
