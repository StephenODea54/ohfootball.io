"""Tests of the publish command, which writes the rating of every season."""

from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout
from datetime import date
from unittest.mock import patch

from ohfootball_rating import cli
from ohfootball_rating.games import Game
from ohfootball_rating.margin import MarginConfig
from ohfootball_rating.publisher import TeamSeason


def game(
    season: int,
    day: date,
    team_a: str,
    team_b: str,
    result: str = "W",
    scores: tuple[int, int] | None = (21, 7),
    team_b_state: str = "OH",
) -> Game:
    return Game(
        game_key=f"{season}-{day.isoformat()}-{team_a}-{team_b}",
        season=season,
        game_date=day,
        team_a_key=team_a,
        team_a_name=team_a,
        team_b_key=team_b,
        team_b_name=team_b,
        team_a_result=result,
        team_a_program_id=team_a,
        team_b_program_id=team_b,
        team_a_division=1,
        team_b_division=1,
        team_a_score=scores[0] if scores else None,
        team_b_score=scores[1] if scores else None,
        team_b_state=team_b_state,
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
        self.snapshots: list = []
        self.predictions: list = []

    def run_publish(self, as_of: date) -> dict:
        def fake_team_seasons(_url: str, *, season: int, marts_schema: str) -> tuple:
            return (
                TeamSeason(season=season, team_key="a", program_id="a", division=1),
                TeamSeason(season=season, team_key="b", program_id="b", division=1),
                # A team without games opens at its division prior, far from the other two, so
                # the median and the mean of a snapshot differ.
                TeamSeason(season=season, team_key="c", program_id="c", division=7),
            )

        def fake_publish_ratings(_url: str, snapshots, *, marts_schema: str) -> int:
            rows = tuple(snapshots)
            dates = {row.as_of_date for row in rows}
            seasons = {row.season for row in rows}
            # The publisher replaces one season and date at a time.
            self.assertEqual(len(dates), 1, "one call carried more than one date")
            self.assertEqual(len(seasons), 1, "one call carried more than one season")
            self.published.append((seasons.pop(), dates.pop(), len(rows)))
            self.snapshots.extend(rows)
            return len(rows)

        def fake_publish_predictions(_url: str, predictions, *, marts_schema: str) -> int:
            self.predictions = list(predictions)
            return len(self.predictions)

        arguments = cli.build_parser().parse_args(["publish", "--as-of-date", as_of.isoformat()])
        with (
            patch.object(cli, "load_games", return_value=self.games),
            patch.object(cli, "load_team_seasons", fake_team_seasons),
            patch.object(cli, "publish_ratings", fake_publish_ratings),
            patch.object(cli, "publish_predictions", fake_publish_predictions),
        ):
            output = io.StringIO()
            with redirect_stdout(output):
                cli._publish(arguments)
        return json.loads(output.getvalue())

    def test_publishes_every_season_of_the_record(self) -> None:
        summary = self.run_publish(date(2026, 8, 16))

        self.assertEqual([row[0] for row in self.published], [1972, 1985, 2026])
        self.assertEqual(summary["published_seasons"], 3)
        self.assertEqual(summary["published_ratings"], 9)

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
            arguments = cli.build_parser().parse_args(["publish", "--as-of-date", "2026-08-16"])
            with redirect_stdout(io.StringIO()):
                cli._publish(arguments)

        self.assertEqual(load.call_count, 1, "the record was read more than once")

    def test_the_median_team_of_each_snapshot_has_a_relative_rating_of_zero(self) -> None:
        self.run_publish(date(2026, 8, 16))

        by_season: dict[int, list] = {}
        for row in self.snapshots:
            by_season.setdefault(row.season, []).append(row)
        for season, rows in by_season.items():
            with self.subTest(season=season):
                ordered = sorted(rows, key=lambda row: row.rating)
                self.assertEqual(ordered[1].relative_rating, 0.0)
                for row in rows:
                    self.assertAlmostEqual(row.relative_rating, row.rating - ordered[1].rating)

    def test_a_team_without_a_game_gets_the_rating_it_opens_the_season_with(self) -> None:
        self.run_publish(date(2026, 8, 16))

        rows_2026 = {row.team_key: row for row in self.snapshots if row.season == 2026}
        rows_1985 = {row.team_key: row for row in self.snapshots if row.season == 1985}
        # The 2026 game is after the day of the run, so each team opens from its history.
        self.assertGreater(rows_2026["a"].rating, rows_2026["b"].rating)
        self.assertGreater(rows_1985["a"].rating, 0)

    def test_stores_a_prediction_for_each_game_played_and_each_game_to_come(self) -> None:
        as_of = date(2026, 8, 30)
        self.games = self.games + (
            game(1985, date(1985, 10, 4), "a", "b", result="unknown", scores=None),
            game(1985, date(1985, 10, 11), "a", "b", scores=(1, 0)),
            game(2026, date(2026, 9, 4), "a", "b", result="unknown", scores=None),
            game(2026, date(2026, 9, 11), "a", "b", result="C", scores=None),
        )
        summary = self.run_publish(as_of)

        dates = {row.game_key: row.as_of_date for row in self.predictions}
        self.assertEqual(dates["1972-1972-09-08-a-b"], date(1972, 9, 8))
        self.assertEqual(dates["2026-2026-08-28-a-b"], date(2026, 8, 28))
        self.assertEqual(dates["2026-2026-09-04-a-b"], as_of)
        self.assertNotIn("2026-2026-09-11-a-b", dates)
        self.assertNotIn("1985-1985-10-04-a-b", dates)
        self.assertEqual(dates["1985-1985-10-11-a-b"], date(1985, 10, 11))
        self.assertEqual(summary["upcoming_predictions"], 1)
        self.assertEqual(summary["published_predictions"], 5)
        upcoming = next(row for row in self.predictions if row.as_of_date == as_of)
        self.assertAlmostEqual(
            upcoming.predicted_margin, upcoming.team_a_rating - upcoming.team_b_rating
        )

    def test_a_completed_game_on_or_after_the_day_of_the_run_is_predicted_as_one_to_come(
        self,
    ) -> None:
        as_of = date(2026, 8, 28)
        self.run_publish(as_of)

        dates = {row.game_key: row.as_of_date for row in self.predictions}
        self.assertEqual(dates["2026-2026-08-28-a-b"], as_of)

    def test_every_game_that_moves_a_rating_has_a_prediction_dated_its_day(self) -> None:
        as_of = date(2026, 8, 30)
        self.games = self.games + (
            game(2026, date(2026, 8, 21), "a", "w", team_b_state="WV"),
            game(1985, date(1985, 9, 13), "b", "w", team_b_state="WV"),
        )
        self.run_publish(as_of)

        dates = {row.game_key: row.as_of_date for row in self.predictions}
        for played in self.games:
            if played.team_a_score is not None and played.game_date < as_of:
                with self.subTest(game=played.game_key):
                    self.assertEqual(dates[played.game_key], played.game_date)

    def test_an_upcoming_game_against_another_state_is_predicted(self) -> None:
        as_of = date(2026, 8, 30)
        self.games = self.games + (
            game(2026, date(2026, 8, 21), "a", "w", team_b_state="WV"),
            game(
                2026, date(2026, 9, 4), "a", "w", result="unknown", scores=None, team_b_state="WV"
            ),
        )
        summary = self.run_publish(as_of)

        dates = {row.game_key: row.as_of_date for row in self.predictions}
        self.assertEqual(dates["2026-2026-09-04-a-w"], as_of)
        self.assertEqual(summary["upcoming_predictions"], 1)

    def test_an_upcoming_game_against_a_new_program_opens_it_at_the_ohio_rating(self) -> None:
        self.games = self.games + (
            game(
                2026, date(2026, 9, 4), "a", "x", result="unknown", scores=None, team_b_state="WV"
            ),
        )
        self.run_publish(date(2026, 8, 30))

        upcoming = {row.game_key: row for row in self.predictions}["2026-2026-09-04-a-x"]
        self.assertEqual(upcoming.team_b_rating, upcoming.team_a_rating)

    def test_no_snapshot_holds_a_team_from_another_state(self) -> None:
        self.games = self.games + (game(2026, date(2026, 8, 21), "a", "w", team_b_state="WV"),)
        summary = self.run_publish(date(2026, 8, 30))

        self.assertNotIn("w", {row.team_key for row in self.snapshots})
        self.assertEqual(summary["published_ratings"], 9)

    def test_the_ohio_side_of_such_a_game_holds_the_rating_of_that_day(self) -> None:
        self.games = self.games + (game(2026, date(2026, 8, 21), "a", "w", team_b_state="WV"),)
        self.run_publish(date(2026, 8, 30))

        by_key = {row.game_key: row for row in self.predictions}
        visit, home = by_key["2026-2026-08-21-a-w"], by_key["2026-2026-08-28-a-b"]
        # a played w first, so it went into its game with b a week later with the rating that
        # game gave it: a quarter of a normal change toward the margin of 14.
        config = MarginConfig()
        change = (
            config.other_state_weight
            * config.learning_weight(0)
            * (14 - config.clip_margin(visit.predicted_margin))
        )
        self.assertAlmostEqual(home.team_a_rating, visit.team_a_rating + change)

    def test_leaves_out_a_season_after_the_one_in_progress(self) -> None:
        self.games = self.games + (game(2030, date(2030, 9, 6), "a", "b"),)
        self.run_publish(date(2026, 8, 16))

        self.assertNotIn(2030, [row[0] for row in self.published])

    def test_stops_when_no_season_holds_a_team(self) -> None:
        with (
            patch.object(cli, "load_games", return_value=self.games),
            patch.object(cli, "load_team_seasons", lambda _url, *, season, marts_schema: ()),
            patch.object(cli, "publish_predictions", return_value=0),
        ):
            arguments = cli.build_parser().parse_args(["publish", "--as-of-date", "2026-08-16"])
            with self.assertRaises(SystemExit):
                cli._publish(arguments)


if __name__ == "__main__":
    unittest.main()
