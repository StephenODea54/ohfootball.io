"""Tests of the publish command, which writes the rating of every season."""

from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout
from datetime import date
from unittest.mock import patch

from ohfootball_predictor import cli
from ohfootball_predictor.games import Game
from ohfootball_predictor.publisher import TeamSeason


def game(season: int, day: date, team_a: str, team_b: str) -> Game:
    return Game(
        game_key=f"{season}-{team_a}-{team_b}",
        season=season,
        game_date=day,
        team_a_key=team_a,
        team_a_name=team_a,
        team_b_key=team_b,
        team_b_name=team_b,
        team_a_result="W",
        team_a_program_id=team_a,
        team_b_program_id=team_b,
        team_a_division=1,
        team_b_division=1,
        team_a_score=21,
        team_b_score=7,
    )


class PublishCommandTests(unittest.TestCase):
    """The command reads the record once and publishes every season from it."""

    def setUp(self) -> None:
        self.games = (
            game(1972, date(1972, 9, 8), "a", "b"),
            game(1985, date(1985, 9, 6), "a", "b"),
            game(2026, date(2026, 8, 28), "a", "b"),
        )
        self.published: list[tuple[int, date, int]] = []

    def run_publish(self, as_of: date) -> dict:
        def fake_team_seasons(_url: str, *, season: int, marts_schema: str) -> tuple:
            return (
                TeamSeason(season=season, team_key="a", program_id="a", division=1),
                TeamSeason(season=season, team_key="b", program_id="b", division=1),
            )

        def fake_publish_ratings(_url: str, snapshots, *, marts_schema: str) -> int:
            rows = tuple(snapshots)
            dates = {row.as_of_date for row in rows}
            seasons = {row.season for row in rows}
            # The publisher replaces one season and date at a time.
            self.assertEqual(len(dates), 1, "one call carried more than one date")
            self.assertEqual(len(seasons), 1, "one call carried more than one season")
            self.published.append((seasons.pop(), dates.pop(), len(rows)))
            return len(rows)

        arguments = cli.build_parser().parse_args(
            ["publish", "--as-of-date", as_of.isoformat()]
        )
        with (
            patch.object(cli, "load_games", return_value=self.games),
            patch.object(cli, "load_team_seasons", fake_team_seasons),
            patch.object(cli, "publish_ratings", fake_publish_ratings),
            patch.object(cli, "publish_predictions", return_value=7),
        ):
            output = io.StringIO()
            with redirect_stdout(output):
                cli._publish(arguments)
        return json.loads(output.getvalue())

    def test_publishes_every_season_of_the_record(self) -> None:
        summary = self.run_publish(date(2026, 8, 16))

        self.assertEqual([row[0] for row in self.published], [1972, 1985, 2026])
        self.assertEqual(summary["published_seasons"], 3)
        self.assertEqual(summary["published_ratings"], 6)

    def test_dates_a_finished_season_at_its_own_year_end(self) -> None:
        self.run_publish(date(2026, 8, 16))

        by_season = {row[0]: row[1] for row in self.published}
        self.assertEqual(by_season[1972], date(1972, 12, 31))
        self.assertEqual(by_season[1985], date(1985, 12, 31))

    def test_dates_the_season_in_progress_at_the_day_of_the_run(self) -> None:
        as_of = date(2026, 8, 16)
        self.run_publish(as_of)

        by_season = {row[0]: row[1] for row in self.published}
        self.assertEqual(by_season[2026], as_of)

    def test_reads_the_games_one_time(self) -> None:
        with (
            patch.object(cli, "load_games", return_value=self.games) as load,
            patch.object(
                cli,
                "load_team_seasons",
                lambda _url, *, season, marts_schema: (
                    TeamSeason(season=season, team_key="a", program_id="a", division=1),
                ),
            ),
            patch.object(cli, "publish_ratings", return_value=1),
            patch.object(cli, "publish_predictions", return_value=0),
        ):
            arguments = cli.build_parser().parse_args(
                ["publish", "--as-of-date", "2026-08-16"]
            )
            with redirect_stdout(io.StringIO()):
                cli._publish(arguments)

        self.assertEqual(load.call_count, 1, "the record was read more than once")

    def test_leaves_out_a_season_after_the_one_in_progress(self) -> None:
        self.games = self.games + (game(2030, date(2030, 9, 6), "a", "b"),)
        self.run_publish(date(2026, 8, 16))

        self.assertNotIn(2030, [row[0] for row in self.published])

    def test_stops_when_no_season_holds_a_team(self) -> None:
        with (
            patch.object(cli, "load_games", return_value=self.games),
            patch.object(
                cli, "load_team_seasons", lambda _url, *, season, marts_schema: ()
            ),
            patch.object(cli, "publish_predictions", return_value=0),
        ):
            arguments = cli.build_parser().parse_args(
                ["publish", "--as-of-date", "2026-08-16"]
            )
            with self.assertRaises(SystemExit):
                cli._publish(arguments)


if __name__ == "__main__":
    unittest.main()
