"""Tests for the two commands, their defaults, and what they refuse."""

from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout
from datetime import date
from pathlib import Path
from unittest import mock

from ohfootball_dataset import cli
from ohfootball_dataset.archive import Archive
from ohfootball_dataset.kaggle_dataset import Publication
from ohfootball_dataset.r2_bucket import Bucket, Upload

DATASET = "someone/ohfootball-high-school-football"
ROWS = {"dim_teams": 3, "dim_dates": 4, "fct_games": 5}
SECRET = "r2-secret-0000000000000000000000000000"
BUCKET = Bucket("0123456789abcdef", "access-key", SECRET, "ohfootball-data")
ARCHIVE = Archive(Path("/tmp/x/ohfootball.zip"), date(2026, 9, 29), 42, "ab" * 32, "cd" * 16, ())
UPLOAD = Upload(
    "2026-09-29/ohfootball.zip",
    "latest/ohfootball.zip",
    (("2026-09-29/ohfootball.zip", "uploaded"), ("latest/ohfootball.zip", "unchanged")),
    ("2026-09-22", "2026-09-29"),
)


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

    def test_writes_no_zip_unless_asked(self) -> None:
        with mock.patch.object(cli, "export_marts", return_value=ROWS):
            with mock.patch.object(cli, "build_archive") as build:
                body = _run(["export", "--directory", "/tmp/export"])
        build.assert_not_called()
        self.assertNotIn("archive", body)

    def test_writes_the_zip_when_asked(self) -> None:
        with mock.patch.object(cli, "export_marts", return_value=ROWS):
            with mock.patch.object(cli, "build_archive", return_value=ARCHIVE) as build:
                with mock.patch.object(
                    cli, "_today_in_project_time_zone", lambda: date(2026, 9, 29)
                ):
                    body = _run(["export", "--directory", "/tmp/export", "--archive"])
        build.assert_called_once_with("/tmp/export", date(2026, 9, 29), counts=ROWS)
        self.assertEqual(
            body["archive"],
            {"bytes": 42, "path": "/tmp/x/ohfootball.zip", "sha256": "ab" * 32},
        )


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

        def fake_publish(directory: str, dataset_id: str, *, version_notes: str) -> Publication:
            seen["publish_directory"] = directory
            seen["notes"] = version_notes
            return Publication(
                "versioned", "updated", ("hsfb",), "missing", ("dim_teams.csv:team_key",)
            )

        with mock.patch.object(cli, "export_marts", fake_export):
            with mock.patch.object(cli, "write_metadata", fake_metadata):
                with mock.patch.object(cli, "publish", fake_publish):
                    body = _run(["publish", "--dataset", DATASET, "--as-of-date", "2026-08-19"])

        self.assertEqual(body["action"], "versioned")
        self.assertEqual(body["metadata"], "updated")
        self.assertEqual(body["invalid_tags"], ["hsfb"])
        self.assertEqual(body["descriptions"], "missing")
        self.assertEqual(body["missing_descriptions"], ["dim_teams.csv:team_key"])
        self.assertEqual(body["read_error"], "")
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
                    lambda *_a, version_notes: (
                        notes.append(version_notes) or Publication("created", "not ready")
                    ),
                ):
                    with mock.patch.object(
                        cli, "_today_in_project_time_zone", lambda: date(2026, 9, 1)
                    ):
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


class ThePublishDownloadCommand(unittest.TestCase):
    def test_exports_zips_and_uploads_from_one_directory(self) -> None:
        seen: dict[str, object] = {}

        def fake_export(database_url: str, directory: str, **options: object) -> dict[str, int]:
            seen["export_directory"] = directory
            seen["schema"] = options["marts_schema"]
            return ROWS

        def fake_build(directory: str, as_of_date: date, *, counts: dict[str, int]) -> Archive:
            seen["archive_directory"] = directory
            seen["as_of_date"] = as_of_date
            seen["counts"] = counts
            return ARCHIVE

        def fake_upload(client: object, bucket_name: str, archive: Archive) -> Upload:
            seen["client"] = client
            seen["bucket_name"] = bucket_name
            seen["archive"] = archive
            return UPLOAD

        with mock.patch.dict("os.environ", {}, clear=True):
            with mock.patch.object(cli, "bucket_from_environment", return_value=BUCKET) as read:
                with mock.patch.object(cli, "export_marts", fake_export):
                    with mock.patch.object(cli, "build_archive", fake_build):
                        with mock.patch.object(cli, "r2_client", return_value="client") as build:
                            with mock.patch.object(cli, "upload_snapshot", fake_upload):
                                with mock.patch.object(
                                    cli, "_today_in_project_time_zone", lambda: date(2026, 9, 29)
                                ):
                                    captured = io.StringIO()
                                    with mock.patch(
                                        "sys.argv",
                                        ["ohfootball-dataset", "publish-download", "--bucket", "b"],
                                    ):
                                        with redirect_stdout(captured):
                                            cli.main()

        read.assert_called_once_with(name="b")
        build.assert_called_once_with(BUCKET)
        self.assertEqual(seen["export_directory"], seen["archive_directory"])
        self.assertEqual(seen["as_of_date"], date(2026, 9, 29))
        self.assertEqual(seen["counts"], ROWS)
        self.assertEqual(seen["client"], "client")
        self.assertEqual(seen["bucket_name"], "ohfootball-data")
        self.assertIs(seen["archive"], ARCHIVE)
        self.assertEqual(seen["schema"], "ohfootball_marts")
        text = captured.getvalue()
        self.assertNotIn(SECRET, text)
        self.assertNotIn("access-key", text)
        self.assertEqual(
            json.loads(text),
            {
                "as_of_date": "2026-09-29",
                "bucket": "ohfootball-data",
                "bytes": 42,
                "files": len(cli.MARTS),
                "objects": {
                    "2026-09-29/ohfootball.zip": "uploaded",
                    "latest/ohfootball.zip": "unchanged",
                },
                "rows": ROWS,
                "sha256": "ab" * 32,
                "snapshot_url": "https://data.ohfootball.io/2026-09-29/ohfootball.zip",
                "snapshots": 2,
                "url": "https://data.ohfootball.io/latest/ohfootball.zip",
            },
        )

    def test_reads_the_bucket_from_the_environment(self) -> None:
        with mock.patch.dict("os.environ", {"R2_BUCKET": "ohfootball-data"}, clear=True):
            arguments = cli.build_parser().parse_args(["publish-download"])
        self.assertEqual(arguments.bucket, "ohfootball-data")

    def test_refuses_to_run_without_the_settings(self) -> None:
        with mock.patch.dict("os.environ", {"R2_SECRET_ACCESS_KEY": SECRET}, clear=True):
            with mock.patch.object(cli, "export_marts") as export:
                with self.assertRaises(SystemExit) as caught:
                    _run(["publish-download"])
        export.assert_not_called()
        self.assertIn("R2_ACCOUNT_ID", str(caught.exception.code))
        self.assertNotIn(SECRET, str(caught.exception.code))

    def test_uploads_nothing_when_a_mart_is_empty(self) -> None:
        rows = {**ROWS, "fct_games": 0}
        with mock.patch.object(cli, "bucket_from_environment", return_value=BUCKET):
            with mock.patch.object(cli, "export_marts", return_value=rows):
                with mock.patch.object(cli, "build_archive") as build:
                    with mock.patch.object(cli, "upload_snapshot") as upload:
                        with self.assertRaises(SystemExit) as caught:
                            _run(["publish-download"])
        build.assert_not_called()
        upload.assert_not_called()
        self.assertIn("fct_games", str(caught.exception.code))


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
