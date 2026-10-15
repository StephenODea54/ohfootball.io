import sys
import types
import unittest
from datetime import date, timedelta
from unittest.mock import patch

from ohfootball_rating.harbin import HarbinGame, HarbinTeam
from ohfootball_rating.harbin_repository import (
    WEEK_ONE_GAMES,
    completed_week,
    harbin_inputs,
    last_regular_season_day,
    load_harbin_inputs,
    season_start,
)

WEEK_ONE = date(2026, 8, 19)


def game_row(key: str, team_a: str, team_b: str, **extra) -> dict:
    row = {
        "game_key": key,
        "game_date": date(2026, 9, 4),
        "team_a_key": team_a,
        "team_b_key": team_b,
        "team_a_result": "W",
        "counts_in_ohsaa_rating": True,
        "is_playoff_game": False,
        "has_team_a_schedule": True,
        "has_team_b_schedule": True,
    }
    return row | extra


class HarbinInputsTest(unittest.TestCase):
    def test_builds_the_teams_and_the_games(self) -> None:
        teams = [
            {"team_key": "oh", "name": "Ohio", "state_code": "OH", "division": 3, "region": 9},
            {"team_key": "pa", "name": "Penn", "state_code": "PA", "division": 2, "region": 7},
            {"team_key": "mi", "name": "Mich", "state_code": "MI", "division": 4, "region": None},
        ]
        games = [
            game_row("1", "oh", "pa"),
            game_row("2", "pa", "nobody", counts_in_ohsaa_rating=False, has_team_b_schedule=False),
            game_row("3", "oh", "mi", has_team_b_schedule=False, is_playoff_game=True),
        ]

        inputs = harbin_inputs(teams, games)

        self.assertEqual(inputs.teams["oh"], HarbinTeam("oh", True, 3, 9))
        # A team from another state has no region.
        self.assertEqual(inputs.teams["pa"], HarbinTeam("pa", False, 2, None))
        # A team with no row is a team from another state without a division.
        self.assertEqual(inputs.teams["nobody"], HarbinTeam("nobody", False, None))
        self.assertEqual(inputs.complete_schedules, frozenset({"pa"}))
        self.assertFalse(inputs.games[1].counts)
        self.assertTrue(inputs.games[2].is_playoff_game)
        self.assertEqual(inputs.names["pa"], "Penn")

    def test_refuses_an_unsafe_schema(self) -> None:
        with self.assertRaises(ValueError):
            load_harbin_inputs("unused", season=2026, marts_schema="marts; drop")

    def test_reads_the_two_queries(self) -> None:
        team = {"team_key": "oh", "name": "Ohio", "state_code": "OH", "division": 1, "region": 1}

        class Result:
            def __init__(self, rows):
                self.rows = rows

            def fetchall(self):
                return self.rows

        class Connection:
            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def execute(self, query, parameters):
                self.parameters = parameters
                return Result([team] if "dim_teams" in query else [game_row("1", "oh", "oh")])

        psycopg = types.SimpleNamespace(connect=lambda *_, **__: Connection())
        rows = types.SimpleNamespace(dict_row=object())
        with patch.dict(sys.modules, {"psycopg": psycopg, "psycopg.rows": rows}):
            inputs = load_harbin_inputs("postgresql://unused", season=2026)

        self.assertEqual(len(inputs.games), 1)
        self.assertIn("oh", inputs.teams)


class WeekTest(unittest.TestCase):
    def test_week_one_is_the_first_week_with_enough_ohio_games(self) -> None:
        teams = {key: HarbinTeam(key, True, 1, 1) for key in ("a", "b")}
        teams["x"] = HarbinTeam("x", False, 1)
        early = [
            HarbinGame(f"e{n}", date(2026, 8, 14), "a", "b", "W") for n in range(WEEK_ONE_GAMES)
        ]
        other_state = [
            HarbinGame(f"x{n}", date(2026, 8, 7), "a", "x", "W") for n in range(WEEK_ONE_GAMES)
        ]
        few = [HarbinGame("f", date(2026, 8, 1), "a", "b", "W")]

        self.assertEqual(season_start(few + other_state + early, teams), date(2026, 8, 12))
        self.assertIsNone(season_start(few, teams))

    def test_a_week_is_over_from_sunday(self) -> None:
        friday = WEEK_ONE + timedelta(days=7 * 5 + 2)
        self.assertEqual(completed_week(friday, WEEK_ONE, last_week=10), 5)
        self.assertEqual(completed_week(friday + timedelta(days=2), WEEK_ONE, last_week=10), 6)
        self.assertEqual(completed_week(friday + timedelta(days=4), WEEK_ONE, last_week=10), 6)
        self.assertEqual(completed_week(WEEK_ONE, WEEK_ONE, last_week=10), 0)
        self.assertEqual(completed_week(date(2026, 12, 1), WEEK_ONE, last_week=10), 10)

    def test_the_regular_season_ends_on_the_saturday_of_week_ten(self) -> None:
        self.assertEqual(last_regular_season_day(WEEK_ONE, 10), date(2026, 10, 24))


if __name__ == "__main__":
    unittest.main()
