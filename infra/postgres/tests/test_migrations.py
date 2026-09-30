"""Checks the names and the text of the migration files.

sustained reads the files in the migrations directory and stops on a file whose name it does not
know. It skips a folder, a file whose name starts with a dot and the backup file of an editor. It
also keeps a checksum of each migration it applied, and it stops on a migration whose text changed
after that. Each stop fails the deploy, so these checks find the same faults before a commit.
"""

from __future__ import annotations

import hashlib
import re
import unittest

from sustained_config import migrations_dir

# A file is an up step, a down step or a step that runs again when its text changes. The number
# sets the order.
NAME = re.compile(r"^(?P<number>\d{3})_[a-z0-9_]+\.(?P<kind>up|down|repeat)\.sql$")

# The SHA-256 digest of each migration that the warehouse holds. A change to one of these files,
# even to a comment, stops the next deploy. Write a new migration instead. Add the digest of a new
# migration here when it is committed.
APPLIED = {
    "001_raw_scrape.up.sql": "72641268cfbc1bf2af3fc7db4701f20ecb85bb5e736c08a26c22306935f97ee7",
    "002_team_elo_ratings.up.sql": "90c189435595fdfa60e473db26d641dd25d1c01b007c20c48771f250bd34edce",
    "003_game_predictions.up.sql": "388ac82fcb1989e838a4df8ae1cb290f1ded0bad65c4ddd7f52770a3b233ba6e",
    "004_ohhsfbdb_raw.up.sql": "b170fc946ac766aae841bb7df350ae2d73b08492aab504c3230403819077b35f",
    "005_ratings_cover_every_season.up.sql": "8b72e04c70ea352f7d12a11a8ef45c25ff6cee9901efb45ce72a9fc0e22dfdd9",
    "006_margin_ratings.up.sql": "49dbd3a6ec3841af78b8a0358299939af4b0c65e4c2f1a2719df84d19a8e843a",
    "007_drop_elo_ratings.up.sql": "f5ef438bb5665800adb2c8ce6c5bb229a3c12857ddf5957f541de4ccfb0c7203",
    "008_recruiting_snapshots.up.sql": "2d80251595c824a0fd9ae1b9b86597ce125d318eae425dacfd233ebc3628ba44",
}


# The endings of the backup files that sustained skips.
SKIPPED = ("~", ".bak", ".orig", ".swp", ".swo", ".tmp")


def files() -> list[str]:
    """Returns the names of the files that sustained reads."""
    return sorted(
        entry.name
        for entry in migrations_dir.iterdir()
        if entry.is_file() and not entry.name.startswith(".") and not entry.name.endswith(SKIPPED)
    )


def up_files() -> list[str]:
    return [name for name in files() if name.endswith(".up.sql")]


class TheMigrationFiles(unittest.TestCase):
    def test_follow_the_names_sustained_reads(self) -> None:
        for name in files():
            with self.subTest(name=name):
                self.assertRegex(name, NAME)

    def test_are_numbered_from_one_without_a_gap(self) -> None:
        numbers = [int(NAME.match(name)["number"]) for name in up_files()]

        self.assertEqual(numbers, list(range(1, len(numbers) + 1)))

    def test_pair_each_down_step_with_an_up_step(self) -> None:
        ups = {name.removesuffix(".up.sql") for name in up_files()}
        for name in files():
            if name.endswith(".down.sql"):
                with self.subTest(name=name):
                    self.assertIn(name.removesuffix(".down.sql"), ups)

    def test_hold_statements(self) -> None:
        for name in files():
            with self.subTest(name=name):
                self.assertTrue((migrations_dir / name).read_text(encoding="utf-8").strip())

    def test_keep_the_text_that_was_applied(self) -> None:
        for name, digest in APPLIED.items():
            with self.subTest(name=name):
                text = (migrations_dir / name).read_bytes()
                self.assertEqual(hashlib.sha256(text).hexdigest(), digest)

    def test_record_the_digest_of_every_up_step(self) -> None:
        self.assertEqual(sorted(APPLIED), up_files())


if __name__ == "__main__":
    unittest.main()
