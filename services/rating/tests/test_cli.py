import os
import unittest
from datetime import date
from unittest.mock import patch

from ohfootball_rating import cli
from ohfootball_rating.cli import build_parser


class CommandLineTests(unittest.TestCase):
    def test_publish_reads_the_season_and_the_day_of_the_snapshot(self) -> None:
        arguments = build_parser().parse_args(
            ["publish", "--season", "2026", "--as-of-date", "2026-09-29"]
        )

        self.assertEqual(arguments.season, 2026)
        self.assertEqual(arguments.as_of_date, date(2026, 9, 29))

    def test_refuses_a_time_zone_that_does_not_exist(self) -> None:
        with patch.dict(os.environ, {"OHFOOTBALL_TIME_ZONE": "Mars/Olympus"}):
            with self.assertRaisesRegex(ValueError, "OHFOOTBALL_TIME_ZONE"):
                cli._today_in_project_time_zone()


if __name__ == "__main__":
    unittest.main()
