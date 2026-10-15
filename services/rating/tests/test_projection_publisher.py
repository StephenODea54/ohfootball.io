import io
import json
import sys
import types
import unittest
from contextlib import redirect_stdout
from dataclasses import replace
from datetime import date
from unittest.mock import patch

from season_fixture import LAST_DAY, SEASON, WEEK_ONE, make_league

from ohfootball_rating import cli
from ohfootball_rating.harbin import counted_games, standings
from ohfootball_rating.harbin_repository import HarbinInputs
from ohfootball_rating.projection import outlooks, own_games, run_projection
from ohfootball_rating.projection_publisher import (
    check_rows,
    projection_rows,
    publish_projection,
)
from ohfootball_rating.simulation import season_games

AS_OF = date(2026, 9, 22)


def make_rows(played_weeks: int = 5):
    league = make_league(played_weeks=played_weeks)
    setup = league.setup()
    season = [game for game in league.games if game.season == SEASON]
    counted = counted_games(season_games(season), league.teams, last_day=LAST_DAY)
    current = standings(counted, league.teams, season=SEASON, week=played_weeks, first_day=WEEK_ONE)
    tally = run_projection(setup, runs=200, seed=3, chunk=100)
    ohio = setup.team_keys[: setup.ohio_count]
    teams = outlooks(
        setup, tally, [current[k].wins for k in ohio], [current[k].losses for k in ohio]
    )
    rows = projection_rows(
        setup=setup,
        own=own_games(setup),
        runs=tally.runs,
        outlooks=teams,
        standings=current,
        as_of_date=AS_OF,
        seed=3,
    )
    return setup, current, rows


class ProjectionRowsTest(unittest.TestCase):
    def test_builds_a_row_for_each_team_and_each_record(self) -> None:
        setup, current, rows = make_rows()

        self.assertEqual(len(rows.outlooks), setup.ohio_count)
        first = rows.outlooks[0]
        line = current[first[0]]
        self.assertEqual(first[4:7], (line.wins, line.losses, line.ties))
        self.assertEqual(first[9], line.divisor)
        keys = {row[0]: row for row in rows.outlooks}
        # The four lists of odds follow the remaining games, and T0 has five of them.
        self.assertEqual(len(keys["T0"][16]), 5)
        for row in rows.outlooks:
            for odds in row[17:21]:
                self.assertEqual(len(odds), len(row[16]))
        # A record row holds the final record, so its games add up to the season.
        for row in rows.records:
            team = keys[row[0]]
            self.assertEqual(row[3] + row[4], team[4] + team[5] + len(team[16]))
        check_rows(rows)

    def test_refuses_a_bad_projection(self) -> None:
        _, _, rows = make_rows()
        empty = replace(rows, outlooks=[])
        twice = replace(rows, outlooks=rows.outlooks + rows.outlooks[:1])
        wrong = list(rows.outlooks[0])
        wrong[11] = 1.5
        far = list(rows.outlooks[0])
        far[10] = float("inf")

        for bad, message in (
            (empty, "at least one team"),
            (twice, "twice"),
            (replace(rows, outlooks=[tuple(wrong)]), "between zero and one"),
            (replace(rows, outlooks=[tuple(far)]), "finite"),
        ):
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                check_rows(bad)


class PublishTest(unittest.TestCase):
    def test_replaces_one_projection_in_one_transaction(self) -> None:
        _, _, rows = make_rows()
        statements: list[str] = []
        copied: dict[str, int] = {}

        class Copy:
            def __init__(self, statement):
                self.statement = statement

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def write_row(self, row):
                table = self.statement.split()[1]
                copied[table] = copied.get(table, 0) + 1

        class Cursor:
            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def execute(self, statement, parameters=None):
                statements.append(" ".join(statement.split()))

            def copy(self, statement):
                return Copy(statement)

        class Connection:
            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def cursor(self):
                return Cursor()

        fake = types.SimpleNamespace(connect=lambda *_: Connection())
        with patch.dict(sys.modules, {"psycopg": fake}):
            published = publish_projection("postgresql://unused", rows)

        self.assertEqual(published, len(rows.outlooks))
        self.assertEqual(sum(s.startswith("DELETE") for s in statements), 3)
        self.assertTrue(any("dim_playoff_projections" in s and "INSERT" in s for s in statements))
        self.assertEqual(copied["ohfootball_marts.fct_playoff_outlooks"], len(rows.outlooks))
        self.assertEqual(copied["ohfootball_marts.fct_playoff_record_odds"], len(rows.records))

    def test_refuses_an_unsafe_schema(self) -> None:
        _, _, rows = make_rows()
        with self.assertRaises(ValueError):
            publish_projection("unused", rows, marts_schema="x;y")


class ProjectCommandTest(unittest.TestCase):
    def run_command(
        self, inputs: HarbinInputs, *extra: str, games=None, as_of: date = AS_OF
    ) -> dict:
        games = make_league().games if games is None else games
        published: list = []
        arguments = ["project", "--as-of-date", as_of.isoformat(), "--runs", "50", *extra]
        output = io.StringIO()
        with (
            patch.object(sys, "argv", ["ohfootball-rating", *arguments]),
            patch.object(cli, "load_games", return_value=tuple(games)),
            patch.object(cli, "load_harbin_inputs", return_value=inputs),
            patch.object(
                cli,
                "publish_projection",
                side_effect=lambda _, rows, **__: published.append(rows) or 8,
            ),
            redirect_stdout(output),
        ):
            cli.main()
        self.published = published
        return json.loads(output.getvalue())

    @staticmethod
    def league_inputs(league=None) -> HarbinInputs:
        league = league or make_league()
        season = [game for game in league.games if game.season == SEASON]
        # The league has eight games a week, so its first week has fewer than fifty Ohio games. Fill
        # the first week until it counts as week one.
        games = list(season_games(season))
        extra = [replace(games[0], game_key=f"pad{n}") for n in range(50)]
        return HarbinInputs(
            teams=league.teams,
            games=tuple(games + extra),
            complete_schedules=frozenset(),
            names={},
        )

    def test_publishes_a_projection(self) -> None:
        report = self.run_command(self.league_inputs(), "--workers", "1")

        self.assertEqual(report["season"], SEASON)
        self.assertEqual(report["seed"], 20260922)
        self.assertEqual(report["runs"], 50)
        self.assertEqual(report["completed_week"], 5)
        self.assertEqual(len(self.published), 1)

    def test_skips_a_season_without_week_one(self) -> None:
        league = make_league()
        inputs = HarbinInputs(
            teams=league.teams, games=(), complete_schedules=frozenset(), names={}
        )

        report = self.run_command(inputs)

        self.assertIn("skipped", report)
        self.assertEqual(self.published, [])

    def test_a_rerun_after_the_week_keeps_its_games_to_play(self) -> None:
        # Week 7 has results already, but on Thursday 1 October only week 6 is over. The games of
        # week 7 must be in the remaining games and not in the record.
        league = make_league(played_weeks=7)
        inputs = self.league_inputs(league)

        report = self.run_command(inputs, games=league.games, as_of=date(2026, 10, 1))

        self.assertEqual(report["completed_week"], 6)
        games: dict[str, int] = {}
        for game in counted_games(inputs.games, inputs.teams, last_day=LAST_DAY):
            for key in (game.team_a_key, game.team_b_key):
                games[key] = games.get(key, 0) + 1
        for row in self.published[0].outlooks:
            played = row[4] + row[5] + row[6]
            self.assertEqual(played + len(row[16]), games[row[0]], row[0])

    def test_skips_before_the_first_week_is_over(self) -> None:
        report = self.run_command(self.league_inputs(), as_of=date(2026, 8, 20))

        self.assertEqual(report["skipped"], "no week of the season is over yet")
        self.assertEqual(self.published, [])

    def test_skips_a_season_without_regions(self) -> None:
        inputs = self.league_inputs()
        teams = {key: replace(team, region=None) for key, team in inputs.teams.items()}

        report = self.run_command(replace(inputs, teams=teams), "--workers", "1")

        self.assertEqual(report["skipped"], "no Ohio team has a region yet")

    def test_skips_without_earlier_seasons(self) -> None:
        league = make_league()
        current = [game for game in league.games if game.season == SEASON]

        report = self.run_command(self.league_inputs(), games=current)

        self.assertEqual(report["skipped"], "no earlier season gives the errors of the model")

    def test_refuses_no_runs(self) -> None:
        with self.assertRaises(SystemExit):
            self.run_command(self.league_inputs(), "--runs", "0")


if __name__ == "__main__":
    unittest.main()
