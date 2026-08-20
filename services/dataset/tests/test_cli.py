"""Tests for the two commands, their defaults, and what they refuse."""

from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout
from datetime import date
from unittest import mock

from ohfootball_dataset import cli

DATASET = "someone/ohfootball-high-school-football"
ROWS = {"dim_teams": 3, "dim_dates": 4, "fct_games": 5}


def _run(argv: list[str]) -> dict[str, object]:
    captured = io.StringIO()
    with mock.patch("sys.argv", ["ohfootball-dataset", *argv]):
        with redirect_stdout(captured):
            cli.main()
    return json.loads(captured.getvalue())


class TheParser(unittest.TestCase):
    def test_needs_a_command(self) -> None:
        with self.assertRaises(SystemExit):
            cli.build_parser().parse_args([])

    def test_reads_the_connection_and_the_schema_from_the_environment(self) -> None:
        with mock.patch.dict(
            "os.environ",
            {
                "DATABASE_URL": "postgresql://elsewhere/ohfootball",
                "OHFOOTBALL_MARTS_SCHEMA": "other_marts",
                "KAGGLE_DATASET": DATASET,
            },
        ):
            arguments = cli.build_parser().parse_args(["publish"])
        self.assertEqual(arguments.database_url, "postgresql://elsewhere/ohfootball")
        self.assertEqual(arguments.marts_schema, "other_marts")
        self.assertEqual(arguments.dataset, DATASET)

    def test_falls_back_to_the_local_warehouse(self) -> None:
        with mock.patch.dict("os.environ", {}, clear=True):
            arguments = cli.build_parser().parse_args(["export", "--directory", "/tmp/export"])
        self.assertEqual(arguments.database_url, cli.DEFAULT_DATABASE_URL)
        self.assertEqual(arguments.marts_schema, "ohfootball_marts")


class TheExportCommand(unittest.TestCase):
    def test_writes_the_files_and_reports_the_rows(self) -> None:
        with mock.patch.object(cli, "export_marts", return_value=ROWS) as export:
            body = _run(
                [
                    "export",
                    "--directory",
                    "/tmp/export",
                    "--marts-schema",
                    "other_marts",
                    "--database-url",
                    "postgresql://elsewhere/ohfootball",
                ]
            )
        export.assert_called_once_with(
            "postgresql://elsewhere/ohfootball",
            "/tmp/export",
            marts_schema="other_marts",
        )
        self.assertEqual(body, {"directory": "/tmp/export", "rows": ROWS})

    def test_needs_a_directory(self) -> None:
        with self.assertRaises(SystemExit):
            cli.build_parser().parse_args(["export"])


class ThePublishCommand(unittest.TestCase):
    def test_exports_writes_the_metadata_and_publishes(self) -> None:
        seen: dict[str, object] = {}

        def fake_export(database_url: str, directory: str, **options: object) -> dict[str, int]:
            seen["export_directory"] = directory
            return ROWS

        def fake_metadata(directory: str, dataset_id: str) -> str:
            seen["metadata_directory"] = directory
            seen["metadata_dataset"] = dataset_id
            return f"{directory}/dataset-metadata.json"

        def fake_publish(directory: str, dataset_id: str, *, version_notes: str) -> str:
            seen["publish_directory"] = directory
            seen["notes"] = version_notes
            return "versioned"

        with mock.patch.object(cli, "export_marts", fake_export):
            with mock.patch.object(cli, "write_metadata", fake_metadata):
                with mock.patch.object(cli, "publish", fake_publish):
                    body = _run(
                        ["publish", "--dataset", DATASET, "--as-of-date", "2026-08-19"]
                    )

        self.assertEqual(body["action"], "versioned")
        self.assertEqual(body["as_of_date"], "2026-08-19")
        self.assertEqual(body["dataset"], DATASET)
        self.assertEqual(body["rows"], ROWS)
        self.assertEqual(body["files"], len(cli.MARTS))
        self.assertEqual(seen["notes"], "marts as of 2026-08-19")
        self.assertEqual(seen["metadata_dataset"], DATASET)
        # One directory holds the files for the whole of it, and it is gone once the upload is done.
        self.assertEqual(seen["export_directory"], seen["metadata_directory"])
        self.assertEqual(seen["export_directory"], seen["publish_directory"])

    def test_dates_the_version_by_the_day_of_the_run(self) -> None:
        notes: list[str] = []
        with mock.patch.object(cli, "export_marts", return_value=ROWS):
            with mock.patch.object(cli, "write_metadata", lambda *_a, **_k: None):
                with mock.patch.object(
                    cli,
                    "publish",
                    lambda *_a, version_notes: notes.append(version_notes) or "created",
                ):
                    with mock.patch.object(cli, "_today_in_project_time_zone", lambda: date(2026, 9, 1)):
                        body = _run(["publish", "--dataset", DATASET])
        self.assertEqual(notes, ["marts as of 2026-09-01"])
        self.assertEqual(body["as_of_date"], "2026-09-01")

    def test_refuses_to_run_without_a_dataset_to_publish_to(self) -> None:
        with mock.patch.dict("os.environ", {}, clear=True):
            with mock.patch.object(cli, "export_marts") as export:
                with self.assertRaises(SystemExit):
                    _run(["publish"])
        export.assert_not_called()

    def test_publishes_nothing_when_the_marts_are_empty(self) -> None:
        empty = {mart.name: 0 for mart in cli.MARTS}
        with mock.patch.object(cli, "export_marts", return_value=empty):
            with mock.patch.object(cli, "publish") as publication:
                with self.assertRaises(SystemExit):
                    _run(["publish", "--dataset", DATASET])
        publication.assert_not_called()


class TheDayOfTheRun(unittest.TestCase):
    def test_is_read_in_the_time_zone_of_the_project(self) -> None:
        with mock.patch.dict("os.environ", {}, clear=True):
            self.assertIsInstance(cli._today_in_project_time_zone(), date)

    def test_is_refused_when_the_time_zone_is_not_a_time_zone(self) -> None:
        with mock.patch.dict("os.environ", {"OHFOOTBALL_TIME_ZONE": "Mars/Olympus_Mons"}):
            with self.assertRaises(ValueError):
                cli._today_in_project_time_zone()


if __name__ == "__main__":
    unittest.main()
