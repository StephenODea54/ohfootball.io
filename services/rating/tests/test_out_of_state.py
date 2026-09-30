import unittest

from ohfootball_rating.out_of_state import (
    OHIO,
    UNKNOWN_STATE,
    ImpliedRatings,
    OpeningEstimates,
    state_label,
)


def estimates(implied: ImpliedRatings, season: int, *, min_games: int = 1, shrinkage: float = 0.0):
    return implied.estimates(season, window_seasons=10, min_games=min_games, shrinkage=shrinkage)


class StateLabelTests(unittest.TestCase):
    def test_reads_the_state_code_then_the_end_of_the_name(self) -> None:
        cases = (
            (("OH", "Logan"), OHIO),
            (("WV", "Crum (WV)"), "WV"),
            (("", "Crum (WV)"), "WV"),
            (("REGION 0", "Highlands (KY)"), "KY"),
            (("", "Winfield"), UNKNOWN_STATE),
            ((None, "Winfield"), UNKNOWN_STATE),
            (("wv", "x"), UNKNOWN_STATE),
            ((" PA ", "x"), "PA"),
            (("", "Lost (OH)"), UNKNOWN_STATE),
        )
        for (code, name), expected in cases:
            with self.subTest(code=code, name=name):
                self.assertEqual(state_label(code, name), expected)


class OpeningEstimatesTests(unittest.TestCase):
    def test_takes_the_cell_then_the_division_then_zero(self) -> None:
        openings = OpeningEstimates(division_means={4: -10.0}, cells={("WV", 4): -12.0})

        self.assertEqual(openings.opening("WV", 4), -12.0)
        self.assertEqual(openings.opening("KY", 4), -10.0)
        self.assertEqual(openings.opening("WV", 3), 0.0)
        self.assertEqual(openings.opening("WV", None), 0.0)

    def test_is_zero_without_any_estimate(self) -> None:
        self.assertEqual(OpeningEstimates().opening("WV", 4), 0.0)


class ImpliedRatingsTests(unittest.TestCase):
    def test_the_mean_of_a_division_needs_enough_games(self) -> None:
        implied = ImpliedRatings()
        for _ in range(29):
            implied.record(2024, "WV", 4, 10.0)

        self.assertEqual(estimates(implied, 2025, min_games=30).division_means, {})
        implied.record(2024, "WV", 4, 10.0)
        self.assertEqual(estimates(implied, 2025, min_games=30).division_means, {4: 10.0})

    def test_reads_only_the_seasons_of_the_window_before_the_season(self) -> None:
        implied = ImpliedRatings()
        implied.record(2014, "WV", 4, 100.0)  # one season before the window of 2025
        implied.record(2015, "WV", 4, 10.0)
        implied.record(2024, "WV", 4, 20.0)
        implied.record(2025, "WV", 4, 1000.0)  # the season itself

        self.assertEqual(estimates(implied, 2025).division_means, {4: 15.0})

    def test_a_record_in_a_season_does_not_change_the_estimates_of_that_season(self) -> None:
        implied = ImpliedRatings()
        implied.record(2024, "WV", 4, 10.0)
        before = estimates(implied, 2025)
        implied.record(2025, "WV", 4, 99.0)

        self.assertEqual(estimates(implied, 2025), before)

    def test_shrinks_a_state_toward_the_mean_of_its_division(self) -> None:
        implied = ImpliedRatings()
        implied.record(2024, "WV", 4, 10.0)
        implied.record(2024, "WV", 4, 20.0)
        implied.record(2024, "PA", 4, -30.0)
        result = estimates(implied, 2025, shrinkage=1.0)

        mean = (10.0 + 20.0 - 30.0) / 3
        self.assertEqual(result.division_means, {4: mean})
        self.assertEqual(result.cells[("WV", 4)], (30.0 + 1.0 * mean) / (2 + 1.0))
        self.assertEqual(result.cells[("PA", 4)], (-30.0 + 1.0 * mean) / (1 + 1.0))

    def test_a_state_in_a_division_without_a_mean_has_no_estimate(self) -> None:
        implied = ImpliedRatings()
        implied.record(2024, "WV", 4, 10.0)
        implied.record(2024, "WV", 3, 10.0)
        result = estimates(implied, 2025, min_games=2, shrinkage=1.0)

        self.assertEqual(result.division_means, {})
        self.assertEqual(result.cells, {})
        self.assertEqual(result.opening("WV", 4), 0.0)

    def test_adds_the_seasons_from_the_earliest_up(self) -> None:
        implied = ImpliedRatings()
        # Recorded out of order: the sum must still run 2022, 2023, 2024.
        implied.record(2024, "WV", 4, 0.1)
        implied.record(2022, "WV", 4, 0.3)
        implied.record(2023, "WV", 4, 0.2)
        result = estimates(implied, 2025)

        self.assertEqual(result.division_means[4], ((0.0 + 0.3) + 0.2 + 0.1) / 3)
        self.assertEqual(result.cells[("WV", 4)], ((0.0 + 0.3) + 0.2 + 0.1) / 3)


if __name__ == "__main__":
    unittest.main()
