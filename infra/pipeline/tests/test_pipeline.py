"""Checks the order of the weekly run and the command of each publication.

make runs the targets of the weekly run one after the other and stops at the first that fails. So
the order decides which publication a failure costs.
"""

from __future__ import annotations

import subprocess
import unittest
from pathlib import Path

PIPELINE = Path(__file__).resolve().parent.parent / "Makefile"

ORDER = ["scrape", "transform", "rate", "publish-site", "publish-download", "publish-dataset"]


def dry_run(*targets: str) -> str:
    """The commands that make would run for the targets, without running them."""
    result = subprocess.run(
        ["make", "--no-print-directory", "-f", str(PIPELINE), "--dry-run", *targets],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout


class TheWeeklyRun(unittest.TestCase):
    def test_runs_each_target_in_order(self) -> None:
        # make prints each call of a target as make, -f, the path of the Makefile, and the target.
        calls = [line.split() for line in dry_run("pipeline").splitlines()]
        targets = [words[3] for words in calls if words[1:3] == ["-f", str(PIPELINE)]]
        self.assertEqual(targets, ORDER)


class TheDownload(unittest.TestCase):
    def test_runs_the_command_of_the_dataset_package(self) -> None:
        self.assertEqual(dry_run("publish-download").strip(), "ohfootball-dataset publish-download")


if __name__ == "__main__":
    unittest.main()
