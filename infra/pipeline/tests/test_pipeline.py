"""Checks the order of the weekly run and the command of each step.

make runs the targets of the weekly run one after the other and stops at the first that fails. So
the order decides which publication a failure costs. The recruiting snapshot is first, but its
failure does not stop the run. It runs again as the last step, and a failure there fails the run.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

PIPELINE = Path(__file__).resolve().parent.parent / "Makefile"

ORDER = [
    "snapshot-recruits",
    "scrape",
    "transform",
    "rate",
    "project",
    "publish-site",
    "publish-download",
    "publish-dataset",
    "snapshot-recruits",
]

# A stand-in for the make that the weekly run calls for each target. It writes the target to a
# file. It fails for the target named by FAIL_TARGET, for the first FAIL_TIMES calls of it.
FAKE_MAKE = """#!/bin/sh
for target; do :; done
echo "$target" >> "$CALLS_FILE"
[ "$target" != "$FAIL_TARGET" ] && exit 0
[ "$(grep -c -x "$target" "$CALLS_FILE")" -gt "$FAIL_TIMES" ]
"""


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

    def test_goes_on_and_succeeds_when_the_last_snapshot_stores_what_the_first_missed(
        self,
    ) -> None:
        code, calls = run_with_a_failure("snapshot-recruits", times=1)

        self.assertEqual(code, 0)
        self.assertEqual(calls, ORDER)

    def test_publishes_and_then_fails_when_both_snapshots_fail(self) -> None:
        code, calls = run_with_a_failure("snapshot-recruits", times=2)

        self.assertNotEqual(code, 0)
        self.assertEqual(calls, ORDER)

    def test_stops_when_the_scrape_fails(self) -> None:
        code, calls = run_with_a_failure("scrape")

        self.assertNotEqual(code, 0)
        self.assertEqual(calls, ["snapshot-recruits", "scrape"])

    def test_skips_the_last_snapshot_when_a_publication_fails(self) -> None:
        code, calls = run_with_a_failure("publish-dataset")

        self.assertNotEqual(code, 0)
        self.assertEqual(calls, ORDER[:-1])

    def test_goes_on_when_the_projection_fails(self) -> None:
        code, calls = run_with_a_failure("project")

        self.assertEqual(code, 0)
        self.assertEqual(calls, ORDER)

    def test_runs_every_target_when_nothing_fails(self) -> None:
        code, calls = run_with_a_failure("")

        self.assertEqual(code, 0)
        self.assertEqual(calls, ORDER)


def run_with_a_failure(target: str, times: int = 1) -> tuple[int, list[str]]:
    """Runs the weekly run with a stand-in make that fails for the first calls of one target, and
    gives the exit code and the targets that were called."""
    with tempfile.TemporaryDirectory() as folder:
        fake = Path(folder) / "make"
        fake.write_text(FAKE_MAKE)
        fake.chmod(0o755)
        calls = Path(folder) / "calls"
        calls.touch()
        environment = os.environ | {
            "CALLS_FILE": str(calls),
            "FAIL_TARGET": target,
            "FAIL_TIMES": str(times),
        }
        result = subprocess.run(
            ["make", "--no-print-directory", "-f", str(PIPELINE), "pipeline", f"MAKE={fake}"],
            capture_output=True,
            text=True,
            env=environment,
        )
        return result.returncode, calls.read_text().split()


class TheSnapshot(unittest.TestCase):
    def test_runs_the_command_of_the_recruiting_package(self) -> None:
        self.assertEqual(dry_run("snapshot-recruits").strip(), "ohfootball-recruiting snapshot")

    def test_holds_no_key_on_its_command_line(self) -> None:
        """Guards against a later edit that puts the key on a command line. The command reads the
        key from the environment."""
        self.assertNotIn("CFBD_API_KEY", dry_run("pipeline"))


class TheProjection(unittest.TestCase):
    def test_runs_the_command_of_the_rating_package(self) -> None:
        self.assertEqual(dry_run("project").strip(), "ohfootball-rating project --workers 2")


class TheDownload(unittest.TestCase):
    def test_runs_the_command_of_the_dataset_package(self) -> None:
        self.assertEqual(dry_run("publish-download").strip(), "ohfootball-dataset publish-download")


if __name__ == "__main__":
    unittest.main()
