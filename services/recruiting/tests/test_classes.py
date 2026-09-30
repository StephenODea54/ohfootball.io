import unittest
from datetime import date

from ohfootball_recruiting.classes import classes_on_the_field, season_of


class TheSeason(unittest.TestCase):
    def test_is_the_calendar_year_of_the_date(self) -> None:
        for day in (date(2026, 1, 1), date(2026, 8, 25), date(2026, 12, 31)):
            with self.subTest(day=day):
                self.assertEqual(season_of(day), 2026)

    def test_moves_on_the_first_of_january(self) -> None:
        self.assertEqual(season_of(date(2027, 1, 1)), 2027)


class TheClassesOnTheField(unittest.TestCase):
    def test_are_the_seniors_the_juniors_and_the_sophomores(self) -> None:
        self.assertEqual(classes_on_the_field(2026), (2027, 2028, 2029))

    def test_never_hold_the_class_that_leaves_in_the_year_of_the_season(self) -> None:
        for season in range(2000, 2040):
            with self.subTest(season=season):
                self.assertNotIn(season, classes_on_the_field(season))

    def test_move_with_the_season(self) -> None:
        self.assertEqual(classes_on_the_field(2027), (2028, 2029, 2030))


if __name__ == "__main__":
    unittest.main()
