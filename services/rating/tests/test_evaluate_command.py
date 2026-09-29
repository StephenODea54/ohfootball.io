"""Tests of the evaluate command, which scores the margin rating on past seasons."""

from __future__ import annotations

import argparse
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from test_margin import league
from test_repository import write_export

from ohfootball_rating import cli


def run_evaluate(*arguments: str, as_of: str = "2030-01-01") -> dict:
    parsed = cli.build_parser().parse_args(["evaluate", "--as-of-date", as_of, *arguments])
    output = io.StringIO()
    with redirect_stdout(output):
        cli._evaluate(parsed)
    return json.loads(output.getvalue())


class EvaluateCommandTests(unittest.TestCase):
    def setUp(self) -> None:
        patcher = patch.object(cli, "load_games", return_value=tuple(league(range(2000, 2016))))
        self.load_games = patcher.start()
        self.addCleanup(patcher.stop)

    def test_scores_each_window_the_pooled_windows_and_the_holdout(self) -> None:
        report = run_evaluate("--windows", "2010:2013", "--holdout", "2014:2015")

        self.assertEqual(
            [window["seasons"] for window in report["windows"]], [[2010, 2011], [2012, 2013]]
        )
        self.assertEqual(report["windows"][0]["games"], 30)
        self.assertEqual(report["pooled"]["games"], 60)
        self.assertEqual(report["holdout"]["games"], 30)
        self.assertEqual(report["games"], 240)
        self.assertEqual(report["config"]["learning_rate"], 1.65)
        self.assertEqual(report["slopes"]["season"], 2015)
        self.assertIn("games_0", report["slopes"]["by_group"])
        self.assertLess(report["pooled"]["log_loss"], 0.6931)

    def test_leaves_out_windows_and_a_holdout_without_games(self) -> None:
        report = run_evaluate("--windows", "2014:2017", "--holdout", "2020:2021")

        self.assertEqual([window["seasons"] for window in report["windows"]], [[2014, 2015]])
        self.assertIsNone(report["holdout"])

    def test_scores_only_games_before_the_cutoff(self) -> None:
        report = run_evaluate(
            "--windows", "2000:2001", "--holdout", "2002:2003", as_of="2001-01-01"
        )

        self.assertEqual(report["games"], 15)

    def test_refuses_windows_that_the_size_does_not_divide(self) -> None:
        with self.assertRaises(SystemExit):
            run_evaluate("--windows", "2000:2002")

    def test_refuses_a_holdout_that_overlaps_the_windows(self) -> None:
        with self.assertRaises(SystemExit):
            run_evaluate("--windows", "2000:2003", "--holdout", "2003:2004")

    def test_stops_when_no_game_is_completed(self) -> None:
        self.load_games.return_value = ()

        with self.assertRaises(SystemExit):
            run_evaluate()

    def test_reads_a_dataset_export_in_place_of_the_warehouse(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            write_export(Path(folder))
            report = run_evaluate(
                "--export-dir",
                folder,
                "--windows",
                "2025:2025",
                "--window-size",
                "1",
                "--holdout",
                "2026:2026",
            )

        self.load_games.assert_not_called()
        self.assertEqual(report["games"], 1)

    def test_the_main_function_runs_each_command(self) -> None:
        for command in ("evaluate", "publish"):
            with self.subTest(command=command):
                with patch.object(cli, f"_{command}") as handler:
                    with patch("sys.argv", ["ohfootball-rating", command]):
                        cli.main()
                handler.assert_called_once()


class SeasonRangeTests(unittest.TestCase):
    def test_reads_a_range_and_refuses_a_bad_one(self) -> None:
        self.assertEqual(cli._season_range("2000:2023"), (2000, 2023))
        for bad in ("2000", "2023:2000", "a:b"):
            with self.subTest(value=bad):
                with self.assertRaises(argparse.ArgumentTypeError):
                    cli._season_range(bad)


if __name__ == "__main__":
    unittest.main()
