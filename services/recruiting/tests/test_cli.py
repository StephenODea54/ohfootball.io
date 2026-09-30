import contextlib
import io
import json
import os
import runpy
import unittest
import warnings
from datetime import date
from unittest import mock

from fakes import FakeApi, FakeStore

from ohfootball_recruiting import cli
from ohfootball_recruiting.cfbd import DEFAULT_API_URL
from ohfootball_recruiting.store import DEFAULT_SCHEMA

KEY = "cfbd-test-key-0000-secret"
SETTINGS = ("DATABASE_URL", "OHFOOTBALL_PRIVATE_SCHEMA", "CFBD_API_URL", "CFBD_API_KEY")


def clean_environment(**values: str) -> dict[str, str]:
    environment = {key: value for key, value in os.environ.items() if key not in SETTINGS}
    return environment | values


class Run:
    """Runs main with a stand-in store and API, and keeps what it wrote and how it ended."""

    def __init__(self, argv: list[str], *, key: str | None = KEY, api: FakeApi | None = None):
        self.store = FakeStore()
        self.api = api or FakeApi()
        self.stores: list[tuple] = []
        self.fetches: list[dict] = []
        self.stdout, self.stderr = io.StringIO(), io.StringIO()
        self.code = 0

        def make_store(url, *, private_schema):
            self.stores.append((url, private_schema))
            return self.store

        def fetch(class_year, **options):
            self.fetches.append(options)
            return self.api(class_year)

        environment = clean_environment(**({"CFBD_API_KEY": key} if key is not None else {}))
        with (
            mock.patch.dict(os.environ, environment, clear=True),
            mock.patch.object(cli, "Store", make_store),
            mock.patch.object(cli, "fetch_class", fetch),
            contextlib.redirect_stdout(self.stdout),
            contextlib.redirect_stderr(self.stderr),
        ):
            try:
                cli.main(argv)
            except SystemExit as stop:
                self.code = stop.code

    @property
    def output(self) -> str:
        return self.stdout.getvalue() + self.stderr.getvalue()


class TheParser(unittest.TestCase):
    def test_reads_the_defaults_from_the_environment(self) -> None:
        environment = clean_environment(
            DATABASE_URL="postgresql://warehouse",
            OHFOOTBALL_PRIVATE_SCHEMA="other",
            CFBD_API_URL="http://api.test",
        )
        with mock.patch.dict(os.environ, environment, clear=True):
            arguments = cli.build_parser().parse_args(["snapshot"])

        self.assertEqual(arguments.database_url, "postgresql://warehouse")
        self.assertEqual(arguments.private_schema, "other")
        self.assertEqual(arguments.api_url, "http://api.test")
        self.assertIsNone(arguments.as_of_date)
        self.assertIsNone(arguments.season)
        self.assertEqual(arguments.calls_remaining_floor, 100)

    def test_has_defaults_without_the_environment(self) -> None:
        with mock.patch.dict(os.environ, clean_environment(), clear=True):
            arguments = cli.build_parser().parse_args(["snapshot"])

        self.assertEqual(arguments.database_url, cli.DEFAULT_DATABASE_URL)
        self.assertEqual(arguments.private_schema, DEFAULT_SCHEMA)
        self.assertEqual(arguments.api_url, DEFAULT_API_URL)

    def test_reads_the_date_the_season_and_the_floor(self) -> None:
        arguments = cli.build_parser().parse_args(
            [
                "snapshot",
                "--as-of-date",
                "2026-09-29",
                "--season",
                "2025",
                "--calls-remaining-floor",
                "7",
            ]
        )

        self.assertEqual(arguments.as_of_date, date(2026, 9, 29))
        self.assertEqual(arguments.season, 2025)
        self.assertEqual(arguments.calls_remaining_floor, 7)

    def test_has_no_option_for_the_key(self) -> None:
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as caught:
            cli.build_parser().parse_args(["snapshot", "--api-key", KEY])

        self.assertEqual(caught.exception.code, 2)


class TheCommand(unittest.TestCase):
    def test_stores_the_three_classes_of_the_season_and_prints_a_summary(self) -> None:
        run = Run(["snapshot", "--as-of-date", "2026-09-29", "--database-url", "postgresql://w"])

        self.assertEqual(run.code, 0)
        self.assertEqual(run.api.calls, [2027, 2028, 2029])
        self.assertEqual(run.stores, [("postgresql://w", DEFAULT_SCHEMA)])
        self.assertEqual(run.fetches[0], {"api_key": KEY, "api_url": DEFAULT_API_URL})
        summary = json.loads(run.stdout.getvalue())
        self.assertEqual(summary["snapshot_date"], "2026-09-29")
        self.assertEqual(summary["calls_made"], 3)
        self.assertEqual(run.stderr.getvalue(), "")

    def test_takes_the_season_from_the_option(self) -> None:
        run = Run(["snapshot", "--as-of-date", "2026-09-29", "--season", "2027"])

        self.assertEqual(run.api.calls, [2028, 2029, 2030])

    def test_refuses_a_season_out_of_range_before_any_call(self) -> None:
        for season in ("0", "1999", "2028", "-5"):
            with self.subTest(season=season):
                run = Run(["snapshot", "--as-of-date", "2026-09-29", "--season", season])

                self.assertIn("the season must be from 2000 to 2027", str(run.code))
                self.assertEqual(run.api.calls, [])

    def test_refuses_a_schema_that_is_not_a_name(self) -> None:
        with mock.patch.object(cli, "fetch_class") as fetch:
            environment = clean_environment(CFBD_API_KEY=KEY)
            with mock.patch.dict(os.environ, environment, clear=True):
                with self.assertRaises(SystemExit) as caught:
                    cli.main(["snapshot", "--private-schema", "x;drop"])

        self.assertIn("invalid private schema", str(caught.exception.code))
        fetch.assert_not_called()

    def test_refuses_a_time_zone_that_does_not_exist_in_one_line(self) -> None:
        environment = clean_environment(CFBD_API_KEY=KEY, OHFOOTBALL_TIME_ZONE="Mars/Olympus")
        with mock.patch.dict(os.environ, environment, clear=True):
            with self.assertRaises(SystemExit) as caught:
                cli.main(["snapshot"])

        self.assertIn("invalid OHFOOTBALL_TIME_ZONE", str(caught.exception.code))

    def test_dates_the_snapshot_today_by_default(self) -> None:
        with mock.patch.object(cli, "today_in_project_time_zone", return_value=date(2027, 3, 1)):
            run = Run(["snapshot"])

        self.assertEqual(json.loads(run.stdout.getvalue())["snapshot_date"], "2027-03-01")
        self.assertEqual(run.api.calls, [2028, 2029, 2030])

    def test_needs_the_key_and_calls_nothing_without_it(self) -> None:
        for key in (None, "", "   "):
            with self.subTest(key=key):
                run = Run(["snapshot"], key=key)

                self.assertIn("CFBD_API_KEY is required", str(run.code))
                self.assertEqual(run.api.calls, [])
                self.assertEqual(run.stores, [])

    def test_fails_and_says_why_when_the_snapshot_stops(self) -> None:
        run = Run(["snapshot", "--as-of-date", "2026-09-29"], api=FakeApi(fail={2027}))

        self.assertEqual(run.code, 1)
        self.assertEqual(
            json.loads(run.stdout.getvalue())["error"],
            "CollegeFootballData answered 503 for class 2027",
        )
        self.assertEqual(
            run.stderr.getvalue(),
            "the recruiting snapshot of 2026-09-29 stopped: "
            "CollegeFootballData answered 503 for class 2027\n",
        )

    def test_never_prints_the_key(self) -> None:
        for api in (FakeApi(), FakeApi(fail={2028}), FakeApi(remaining={2027: 1})):
            with self.subTest(api=api):
                run = Run(["snapshot", "--as-of-date", "2026-09-29"], api=api)

                self.assertNotIn(KEY, run.output)


class TheModule(unittest.TestCase):
    def test_runs_the_command_when_python_runs_it(self) -> None:
        with (
            mock.patch.dict(os.environ, clean_environment(), clear=True),
            mock.patch("sys.argv", ["ohfootball-recruiting", "snapshot"]),
            self.assertRaises(SystemExit) as caught,
            warnings.catch_warnings(),
        ):
            # The tests import the module first, and runpy warns that it runs it again.
            warnings.simplefilter("ignore", RuntimeWarning)
            runpy.run_module("ohfootball_recruiting.cli", run_name="__main__", alter_sys=False)

        self.assertIn("CFBD_API_KEY is required", str(caught.exception.code))


class TheToday(unittest.TestCase):
    def test_is_the_date_in_the_time_zone_of_the_project(self) -> None:
        with mock.patch.dict(os.environ, {"OHFOOTBALL_TIME_ZONE": "America/New_York"}):
            self.assertIsInstance(cli.today_in_project_time_zone(), date)

    def test_refuses_a_time_zone_that_does_not_exist(self) -> None:
        with mock.patch.dict(os.environ, {"OHFOOTBALL_TIME_ZONE": "Mars/Olympus"}):
            with self.assertRaisesRegex(ValueError, "OHFOOTBALL_TIME_ZONE"):
                cli.today_in_project_time_zone()


if __name__ == "__main__":
    unittest.main()
