import unittest
from datetime import date, timedelta
from random import Random

from ohfootball_rating.harbin import (
    HarbinGame,
    HarbinLine,
    HarbinTeam,
    PlayoffFormat,
    counted_games,
    division_points,
    first_wednesday,
    playoff_format,
    seed_region,
    standings,
    week_of,
)

SEASON = 2026
# A Wednesday, so week one runs from here to the next Tuesday.
WEEK_ONE = date(2026, 8, 19)
LAST_DAY = date(2026, 10, 24)


def friday(week: int) -> date:
    return WEEK_ONE + timedelta(days=7 * (week - 1) + 2)


def team(key: str, division: int | None = 1, *, ohio: bool = True, region: int = 1) -> HarbinTeam:
    return HarbinTeam(
        team_key=key, is_ohio=ohio, division=division, region=region if ohio else None
    )


def played(key: str, week: int, team_a: str, team_b: str, result: str, **extra) -> HarbinGame:
    return HarbinGame(
        game_key=key,
        game_date=friday(week),
        team_a_key=team_a,
        team_b_key=team_b,
        team_a_result=result,
        **extra,
    )


class DivisionPointsTest(unittest.TestCase):
    def test_gives_the_points_of_each_division(self) -> None:
        self.assertEqual(
            [division_points(SEASON, division) for division in range(1, 8)],
            [6.5, 6.0, 5.5, 5.0, 4.5, 4.0, 3.5],
        )

    def test_refuses_a_season_before_seven_divisions(self) -> None:
        with self.assertRaises(ValueError):
            division_points(2012, 1)

    def test_refuses_an_unknown_division(self) -> None:
        with self.assertRaises(ValueError):
            division_points(SEASON, 8)


class PlayoffFormatTest(unittest.TestCase):
    def test_gives_the_format_of_each_era(self) -> None:
        self.assertEqual(
            playoff_format(2026), PlayoffFormat(12, byes=4, home_games=8, hosted_rounds=3)
        )
        self.assertEqual(
            playoff_format(2021), PlayoffFormat(16, byes=0, home_games=8, hosted_rounds=2)
        )
        self.assertEqual(
            playoff_format(2013), PlayoffFormat(8, byes=0, home_games=4, hosted_rounds=1)
        )

    def test_refuses_the_open_tournament_and_older_seasons(self) -> None:
        for season in (2020, 2012):
            with self.subTest(season=season), self.assertRaises(ValueError):
                playoff_format(season)


class WeekTest(unittest.TestCase):
    def test_a_week_runs_from_wednesday_to_tuesday(self) -> None:
        self.assertEqual(week_of(WEEK_ONE, WEEK_ONE), 1)
        self.assertEqual(week_of(WEEK_ONE + timedelta(days=6), WEEK_ONE), 1)
        self.assertEqual(week_of(WEEK_ONE + timedelta(days=7), WEEK_ONE), 2)

    def test_finds_the_wednesday_of_a_game(self) -> None:
        self.assertEqual(first_wednesday(date(2026, 8, 21)), WEEK_ONE)
        self.assertEqual(first_wednesday(date(2026, 8, 19)), WEEK_ONE)
        self.assertEqual(first_wednesday(date(2026, 8, 25)), WEEK_ONE)


class CountedGamesTest(unittest.TestCase):
    def test_keeps_only_the_games_that_count(self) -> None:
        teams = {key: team(key) for key in "ABCDEF"}
        games = [
            played("rated", 1, "A", "B", "W"),
            played("club", 2, "A", "C", "W", counts=False),
            played("playoff", 2, "A", "D", "W", is_playoff_game=True),
            played("canceled", 3, "A", "E", "C"),
            played("upcoming", 4, "A", "F", "unknown"),
            HarbinGame("late", LAST_DAY + timedelta(days=1), "B", "C", "W"),
        ]

        kept = counted_games(games, teams, last_day=LAST_DAY)

        self.assertEqual([game.game_key for game in kept], ["rated", "upcoming"])

    def test_keeps_the_first_ten_games_of_a_team_from_another_state(self) -> None:
        teams = {"X": team("X", 2, ohio=False)} | {f"O{n}": team(f"O{n}") for n in range(11)}
        games = [played(f"g{n}", n + 1, f"O{n}", "X", "W") for n in range(11)]

        kept = counted_games(games, teams, last_day=friday(12))

        self.assertEqual(len(kept), 10)
        self.assertNotIn("g10", {game.game_key for game in kept})


class StandingsTest(unittest.TestCase):
    def test_adds_up_the_two_levels(self) -> None:
        # A beats B (division II) and C (division III). B beats C. C beats nobody.
        teams = {"A": team("A", 1), "B": team("B", 2), "C": team("C", 3)}
        games = [
            played("1", 1, "A", "B", "W"),
            played("2", 2, "C", "A", "L"),
            played("3", 3, "B", "C", "W"),
        ]

        lines = standings(games, teams, season=SEASON, week=3, first_day=WEEK_ONE)

        a = lines["A"]
        self.assertEqual((a.wins, a.losses, a.ties, a.games), (2, 0, 0, 2))
        self.assertEqual(a.level_one, 6.0 + 5.5)
        # B has 5.5 points from its win over C. C has none.
        self.assertEqual(a.level_two, 5.5)
        # A and B each have one open date, and C has one.
        self.assertEqual(a.divisor, 100 - 10 - 1 - 1)
        self.assertAlmostEqual(a.average, 11.5 / 2 + 10 * 5.5 / 88)
        self.assertEqual(lines["C"].average, 0.0)
        # The third level is the second level of the defeated opponents: B has the 0 of C.
        self.assertEqual(a.level_three, 0.0)
        self.assertEqual(lines["B"].level_three, lines["C"].level_two)

    def test_counts_a_tie_at_half(self) -> None:
        teams = {"A": team("A", 1), "B": team("B", 1), "C": team("C", 4)}
        games = [played("1", 1, "A", "B", "T"), played("2", 2, "B", "C", "W")]

        lines = standings(games, teams, season=SEASON, week=2, first_day=WEEK_ONE)

        self.assertEqual(lines["A"].ties, 1)
        self.assertEqual(lines["A"].level_one, 3.25)
        # B has 3.25 for the tie and 5.0 for the win, and the tie gives A half of it.
        self.assertEqual(lines["A"].level_two, 0.5 * (3.25 + 5.0))

    def test_a_double_forfeit_is_a_loss_for_both_teams(self) -> None:
        teams = {"A": team("A"), "B": team("B")}
        games = [played("1", 1, "A", "B", "L", team_b_result="L")]

        lines = standings(games, teams, season=SEASON, week=1, first_day=WEEK_ONE)

        for key in "AB":
            self.assertEqual((lines[key].wins, lines[key].losses), (0, 1))
            self.assertEqual(lines[key].level_one, 0.0)
        self.assertEqual(games[0].scores(), (0.0, 0.0))
        self.assertIsNone(played("2", 2, "A", "B", "unknown").scores())

    def test_a_team_from_another_state_gives_its_division_points_for_each_win(self) -> None:
        teams = {
            "A": team("A", 1),
            "X": team("X", 2, ohio=False),
            "Y": team("Y", None, ohio=False),
            "Z": team("Z", None, ohio=False),
        }
        games = [
            played("1", 1, "X", "Y", "W"),
            played("2", 2, "X", "Z", "T"),
            played("3", 3, "A", "X", "W"),
        ]

        lines = standings(games, teams, season=SEASON, week=3, first_day=WEEK_ONE)

        self.assertEqual(set(lines), {"A"})
        self.assertEqual(lines["A"].level_one, 6.0)
        self.assertEqual(lines["A"].level_two, 6.0 * 1.5)

    def test_leaves_out_later_weeks_and_games_without_a_result(self) -> None:
        teams = {"A": team("A"), "B": team("B")}
        games = [played("1", 1, "A", "B", "W"), played("2", 2, "A", "B", "unknown")]

        lines = standings(games, teams, season=SEASON, week=1, first_day=WEEK_ONE)
        later = standings(games, teams, season=SEASON, week=2, first_day=WEEK_ONE)

        self.assertEqual(lines["A"].divisor, 100)
        self.assertEqual(later["A"].games, 1)
        self.assertEqual(later["A"].divisor, 100 - 10 - 1)

    def test_a_team_without_games_has_no_average(self) -> None:
        lines = standings([], {"A": team("A")}, season=SEASON, week=1, first_day=WEEK_ONE)

        self.assertEqual(lines["A"].average, 0.0)
        self.assertEqual(lines["A"].divisor, 90)

    def test_skips_level_two_when_the_divisor_is_zero(self) -> None:
        # Ten open dates of the team leave no divisor.
        teams = {"A": team("A"), "B": team("B")}
        games = [played("1", 1, "A", "B", "W")]

        lines = standings(games, teams, season=SEASON, week=11, first_day=WEEK_ONE)

        self.assertLessEqual(lines["A"].divisor, 0)
        self.assertEqual(lines["A"].average, 6.5)


class SeedRegionTest(unittest.TestCase):
    @staticmethod
    def line(key: str, average: float, level_three: float = 0.0) -> HarbinLine:
        return HarbinLine(key, 0, 0, 0, 0.0, 0.0, level_three, 100, average)

    def test_orders_by_the_average_to_four_decimals(self) -> None:
        lines = [self.line("A", 10.0), self.line("B", 12.0), self.line("C", 11.0)]

        self.assertEqual(seed_region(lines), ("B", "C", "A"))

    def test_breaks_a_tie_with_the_third_level(self) -> None:
        lines = [self.line("A", 10.00001, 5.0), self.line("B", 10.00002, 9.0)]

        self.assertEqual(seed_region(lines), ("B", "A"))

    def test_draws_lots_for_a_full_tie(self) -> None:
        lines = [self.line("A", 10.0), self.line("B", 10.0)]

        self.assertEqual(seed_region(lines), ("A", "B"))
        orders = {seed_region(lines, rng=Random(seed)) for seed in range(20)}
        self.assertEqual(orders, {("A", "B"), ("B", "A")})


if __name__ == "__main__":
    unittest.main()
