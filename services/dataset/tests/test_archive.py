"""Tests for the zip, the README in it, and the manifest."""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import unittest
import zipfile
from datetime import date
from pathlib import Path
from unittest import mock

from test_marts import unpublished_names

from ohfootball_dataset import archive
from ohfootball_dataset.archive import (
    ARCHIVE_FILE,
    DOWNLOAD_URL,
    MANIFEST_FILE,
    README_FILE,
    ArchivedFile,
    build_archive,
    data_dictionary,
    manifest,
    manifest_with_archive,
)
from ohfootball_dataset.kaggle_dataset import LICENSE, WEBSITE
from ohfootball_dataset.marts import MARTS, Column, Mart

DAY = date(2026, 9, 29)
COUNTS = {mart.name: index + 1 for index, mart in enumerate(MARTS)}


def write_csv_files(directory: Path, marts: tuple[Mart, ...] = MARTS) -> dict[str, bytes]:
    """Write one small CSV file per mart, and return the bytes of each."""
    written = {}
    for mart in marts:
        body = (",".join(mart.column_names) + "\n" + "value\n").encode()
        (directory / mart.file_name).write_bytes(body)
        written[mart.file_name] = body
    return written


class TheArchive(unittest.TestCase):
    def setUp(self) -> None:
        self.folder = tempfile.TemporaryDirectory()
        self.directory = Path(self.folder.name)
        self.csv_files = write_csv_files(self.directory)

    def tearDown(self) -> None:
        self.folder.cleanup()

    def test_holds_the_readme_the_manifest_and_every_csv_in_order(self) -> None:
        built = build_archive(self.directory, DAY, counts=COUNTS)
        self.assertEqual(built.path, self.directory / ARCHIVE_FILE)
        with zipfile.ZipFile(built.path) as opened:
            self.assertEqual(
                opened.namelist(),
                [README_FILE, MANIFEST_FILE, *(mart.file_name for mart in MARTS)],
            )
            for name, body in self.csv_files.items():
                self.assertEqual(opened.read(name), body)
            self.assertEqual(opened.read(README_FILE).decode(), data_dictionary(DAY, MARTS))
            inner = json.loads(opened.read(MANIFEST_FILE))
        self.assertEqual(inner["as_of_date"], "2026-09-29")
        self.assertNotIn("archive", inner)

    def test_leaves_the_readme_and_the_manifest_in_the_directory(self) -> None:
        build_archive(self.directory, DAY, counts=COUNTS)
        self.assertTrue((self.directory / README_FILE).is_file())
        self.assertTrue((self.directory / MANIFEST_FILE).is_file())

    def test_gives_the_same_bytes_for_the_same_files(self) -> None:
        first = build_archive(self.directory, DAY, counts=COUNTS)
        for mart in MARTS:
            os.utime(self.directory / mart.file_name, (1_000_000_000, 1_000_000_000))
        second = build_archive(self.directory, DAY, counts=COUNTS)
        self.assertEqual(first.sha256, second.sha256)
        self.assertEqual(first.md5, second.md5)

    def test_changes_when_the_date_changes(self) -> None:
        first = build_archive(self.directory, DAY, counts=COUNTS)
        second = build_archive(self.directory, date(2026, 10, 6), counts=COUNTS)
        self.assertNotEqual(first.sha256, second.sha256)

    def test_dates_every_entry_1980_and_marks_it_a_regular_file(self) -> None:
        built = build_archive(self.directory, DAY, counts=COUNTS)
        with zipfile.ZipFile(built.path) as opened:
            for info in opened.infolist():
                self.assertEqual(info.date_time, (1980, 1, 1, 0, 0, 0))
                self.assertEqual(info.external_attr >> 16, 0o100644)
                self.assertEqual(info.compress_type, zipfile.ZIP_DEFLATED)

    def test_copies_a_file_larger_than_one_block(self) -> None:
        large = b"x" * 100 + b"\n"
        (self.directory / MARTS[0].file_name).write_bytes(large)
        with mock.patch.object(archive, "_BLOCK", 16):
            built = build_archive(self.directory, DAY, counts=COUNTS)
        with zipfile.ZipFile(built.path) as opened:
            self.assertEqual(opened.read(MARTS[0].file_name), large)
        self.assertEqual(built.sha256, hashlib.sha256(built.path.read_bytes()).hexdigest())

    def test_reports_the_rows_the_size_and_the_sha256_of_each_file(self) -> None:
        built = build_archive(self.directory, DAY, counts=COUNTS)
        self.assertEqual(
            built.files,
            tuple(
                ArchivedFile(
                    mart.file_name,
                    COUNTS[mart.name],
                    len(self.csv_files[mart.file_name]),
                    hashlib.sha256(self.csv_files[mart.file_name]).hexdigest(),
                )
                for mart in MARTS
            ),
        )
        body = built.path.read_bytes()
        self.assertEqual(built.bytes, len(body))
        self.assertEqual(built.sha256, hashlib.sha256(body).hexdigest())
        self.assertEqual(built.md5, hashlib.md5(body).hexdigest())
        self.assertEqual(built.as_of_date, DAY)

    def test_refuses_a_directory_that_misses_a_mart(self) -> None:
        (self.directory / MARTS[-1].file_name).unlink()
        with self.assertRaisesRegex(ValueError, MARTS[-1].file_name):
            build_archive(self.directory, DAY, counts=COUNTS)
        self.assertFalse((self.directory / ARCHIVE_FILE).exists())


class TheManifest(unittest.TestCase):
    def test_names_every_file_its_columns_and_the_license(self) -> None:
        files = [ArchivedFile(mart.file_name, 7, 11, "ab" * 32) for mart in MARTS]
        body = manifest(DAY, files)
        self.assertEqual(body["as_of_date"], "2026-09-29")
        self.assertEqual(body["license"], LICENSE)
        self.assertEqual(body["website"], WEBSITE)
        self.assertEqual(
            [(file["name"], file["columns"]) for file in body["files"]],
            [(mart.file_name, list(mart.column_names)) for mart in MARTS],
        )
        self.assertEqual({file["rows"] for file in body["files"]}, {7})

    def test_holds_no_time_of_day(self) -> None:
        files = [ArchivedFile(mart.file_name, 1, 1, "00") for mart in MARTS]
        text = json.dumps(manifest(DAY, files))
        self.assertIsNone(re.search(r"\d{2}:\d{2}", text))

    def test_published_copy_adds_the_key_the_size_and_the_sha256_of_the_zip(self) -> None:
        files = (ArchivedFile(MARTS[0].file_name, 1, 1, "00"),)
        built = archive.Archive(Path("ohfootball.zip"), DAY, 42, "cd" * 32, "ef" * 16, files)
        body = json.loads(manifest_with_archive(built, "2026-09-29/ohfootball.zip"))
        self.assertEqual(
            body["archive"],
            {"key": "2026-09-29/ohfootball.zip", "bytes": 42, "sha256": "cd" * 32},
        )
        self.assertEqual(body["files"][0]["name"], MARTS[0].file_name)


class TheDataDictionary(unittest.TestCase):
    def test_describes_every_file_and_every_column(self) -> None:
        text = data_dictionary(DAY)
        for mart in MARTS:
            self.assertIn(f"### {mart.file_name}", text)
            self.assertIn(mart.description, text)
            for column in mart.columns:
                self.assertIn(
                    f"| `{column.name}` | {column.kaggle_type} | {column.description} |", text
                )

    def test_names_no_column_that_is_not_published(self) -> None:
        self.assertEqual(unpublished_names(data_dictionary(DAY)), [])

    def test_names_the_license_the_date_and_the_download(self) -> None:
        text = data_dictionary(DAY)
        self.assertIn(LICENSE, text)
        self.assertIn("2026-09-29", text)
        self.assertIn(f"{DOWNLOAD_URL}/latest/{ARCHIVE_FILE}", text)
        self.assertIn(f"{DOWNLOAD_URL}/snapshots.json", text)

    def test_keeps_a_description_in_one_cell(self) -> None:
        mart = Mart(
            name="odd",
            description="Odd.",
            columns=(Column("a", description="one | two\nthree", kaggle_type="string"),),
            order_by=("a",),
        )
        self.assertIn("| `a` | string | one \\| two three |", data_dictionary(DAY, (mart,)))

    def test_has_an_address_with_no_trailing_slash(self) -> None:
        self.assertFalse(DOWNLOAD_URL.endswith("/"))


if __name__ == "__main__":
    unittest.main()
