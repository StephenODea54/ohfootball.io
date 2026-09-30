"""Checks that the private schema stays private.

The terms of CollegeFootballData let the project store its recruiting data and train models on
it, but not publish the raw records. The records go in the schema ohfootball_private. Every
service connects as the owner of the warehouse, so a grant cannot keep the API, dbt or the
dataset away from the schema. This test is the control: only the migrations, the recruiting
package and the docs may name the schema. A file anywhere else that names it fails the test.
"""

from __future__ import annotations

import subprocess
import unittest
from pathlib import Path

from sustained_config import migrations_dir

SCHEMA = "ohfootball_private"
MIGRATION = migrations_dir / "008_recruiting_snapshots.up.sql"
ROOT = migrations_dir.parents[2]

# The folders whose files may name the schema.
ALLOWED = ("infra/postgres/", "services/recruiting/", "docs/")


def repository_files() -> list[str]:
    """Returns the files that git tracks or would track, as paths from the root.

    git leaves out what .gitignore names, so installed packages, build output and exports of the
    data are not read. A file that is staged but not committed is in the list.
    """
    listed = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        capture_output=True,
        check=True,
    )
    return sorted({name for name in listed.stdout.decode().split("\0") if name})


def names_the_schema(path: Path) -> bool:
    """Tells if a regular file holds the name of the schema. A link or a missing file does not."""
    if path.is_symlink() or not path.is_file():
        return False
    return SCHEMA.encode() in path.read_bytes()


class ThePrivateSchema(unittest.TestCase):
    def test_is_created_with_both_tables(self) -> None:
        text = MIGRATION.read_text(encoding="utf-8")

        self.assertIn(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA};", text)
        self.assertIn(f"CREATE TABLE IF NOT EXISTS {SCHEMA}.recruiting_snapshots (", text)
        self.assertIn(f"CREATE TABLE IF NOT EXISTS {SCHEMA}.recruits (", text)

    def test_revokes_the_grant_to_public(self) -> None:
        text = MIGRATION.read_text(encoding="utf-8")

        self.assertIn(f"REVOKE ALL ON SCHEMA {SCHEMA} FROM public;", text)

    def test_is_named_only_by_the_allowed_folders(self) -> None:
        for name in repository_files():
            if name.startswith(ALLOWED):
                continue
            with self.subTest(path=name):
                self.assertFalse(names_the_schema(ROOT / name), f"{name} names {SCHEMA}")


class TheSearch(unittest.TestCase):
    def test_lists_the_migration_and_the_services(self) -> None:
        names = repository_files()

        self.assertIn(str(MIGRATION.relative_to(ROOT)), names)
        self.assertTrue(any(name.startswith("services/api/") for name in names))
        self.assertTrue(any(name.startswith("services/dataset/") for name in names))

    def test_leaves_out_what_git_ignores(self) -> None:
        names = repository_files()

        self.assertFalse(any("/node_modules/" in name for name in names))
        self.assertFalse(any("/__pycache__/" in name for name in names))

    def test_finds_a_file_that_names_the_schema(self) -> None:
        self.assertTrue(names_the_schema(MIGRATION))

    def test_skips_a_missing_file(self) -> None:
        self.assertFalse(names_the_schema(ROOT / "no" / "such" / "file"))


if __name__ == "__main__":
    unittest.main()
