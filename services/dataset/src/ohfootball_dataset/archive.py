"""The zip that people download, and the two text files that describe it.

The zip holds the exported CSV files, a `README.md` that describes each file and each column, and a
`manifest.json` that gives the date, the rows, the size, and the SHA-256 of each file. The text of
the README comes from `marts.py`, the same as the metadata that Kaggle shows.

The zip is written the same way each time. The entries are in a fixed order, each entry has the
same time and the same mode, and nothing reads the clock. So the same files on the same date give
the same bytes with the same Python. A different build of zlib can compress the same files to other
bytes, so the claim does not reach across images.

The files are copied into the zip one block at a time, so the zip costs one block of memory and not
the size of a mart.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import zipfile
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

from .kaggle_dataset import LICENSE, NOTES, REPOSITORY, SOURCES, WEBSITE
from .marts import MARTS, Mart

ARCHIVE_FILE = "ohfootball.zip"
MANIFEST_FILE = "manifest.json"
README_FILE = "README.md"

# The address of the bucket that holds the download.
DOWNLOAD_URL = "https://data.ohfootball.io"
LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/"

# The earliest time that a zip entry can hold. Every entry has it, so the time a file was written
# does not change the zip.
_FIXED_TIME = (1980, 1, 1, 0, 0, 0)
# A regular file that all can read and the owner can write.
_FILE_MODE = 0o100644 << 16
_BLOCK = 1 << 20


@dataclass(frozen=True, slots=True)
class ArchivedFile:
    """One CSV file in the zip."""

    name: str
    rows: int
    bytes: int
    sha256: str


@dataclass(frozen=True, slots=True)
class Archive:
    """The zip that was written, and what it holds.

    `md5` is the hex MD5 of the zip. The upload sends it so that the bucket can check the bytes it
    receives.
    """

    path: Path
    as_of_date: date
    bytes: int
    sha256: str
    md5: str
    files: tuple[ArchivedFile, ...]


def data_dictionary(as_of_date: date, marts: Iterable[Mart] = MARTS) -> str:
    """The README in the zip, with a table of the columns of each file."""
    sections = [
        "# Ohio High School Football: Games and Ratings",
        (
            "The game record of Ohio high school football, the teams that played it, and a "
            f"rating in points for every team in every season. This copy holds the marts as of "
            f"{as_of_date.isoformat()}."
        ),
        "## License",
        f"The data is published under {LICENSE} ([the text]({LICENSE_URL})). You can use it for "
        "any purpose, and you do not have to ask.",
        "## Sources",
        SOURCES,
        "## Links",
        "\n".join(
            (
                f"- The website: [ohfootball.io]({WEBSITE})",
                f"- The code: [GitHub]({REPOSITORY})",
                f"- A wrong score or a missing school: [open an issue]({REPOSITORY}/issues)",
                f"- The newest copy of this zip: {DOWNLOAD_URL}/latest/{ARCHIVE_FILE}",
                f"- The copy of one date: {DOWNLOAD_URL}/YYYY-MM-DD/{ARCHIVE_FILE}",
                f"- The list of the dates: {DOWNLOAD_URL}/snapshots.json",
            )
        ),
        "## Files",
    ]
    for mart in marts:
        rows = "\n".join(
            f"| `{column.name}` | {column.kaggle_type} | {_cell(column.description)} |"
            for column in mart.columns
        )
        sections.append(f"### {mart.file_name}")
        sections.append(mart.description)
        sections.append(f"| Column | Type | Description |\n| --- | --- | --- |\n{rows}")
    sections.append("## Notes")
    sections.append(NOTES)
    return "\n\n".join(sections) + "\n"


def manifest(
    as_of_date: date, files: Iterable[ArchivedFile], marts: Iterable[Mart] = MARTS
) -> dict[str, Any]:
    """The date, the license, and the rows, size, SHA-256, and columns of each file.

    It holds no time of day, so the same files on the same date give the same manifest.
    """
    columns = {mart.file_name: list(mart.column_names) for mart in marts}
    return {
        "as_of_date": as_of_date.isoformat(),
        "license": LICENSE,
        "website": WEBSITE,
        "repository": REPOSITORY,
        "files": [
            {
                "name": file.name,
                "rows": file.rows,
                "bytes": file.bytes,
                "sha256": file.sha256,
                "columns": columns[file.name],
            }
            for file in files
        ],
    }


def manifest_with_archive(archive: Archive, key: str, marts: Iterable[Mart] = MARTS) -> bytes:
    """The manifest that is published next to the zip, as bytes.

    It is the manifest in the zip with the key, the size, and the SHA-256 of the zip added. The zip
    cannot hold its own SHA-256, so only this copy has it.
    """
    body = manifest(archive.as_of_date, archive.files, marts)
    body["archive"] = {"key": key, "bytes": archive.bytes, "sha256": archive.sha256}
    return _json(body)


def build_archive(
    directory: str | Path,
    as_of_date: date,
    *,
    counts: dict[str, int],
    marts: Iterable[Mart] = MARTS,
) -> Archive:
    """Write the README, the manifest, and the zip into a directory that holds the CSV files.

    The README and the manifest are also left in the directory, so a check on a laptop can read
    what the zip holds without opening it.
    """
    folder = Path(directory)
    published = tuple(marts)
    sources = [folder / mart.file_name for mart in published]
    for source in sources:
        if not source.is_file():
            raise ValueError(f"no file for {source.name} in {str(folder)!r}")

    files = tuple(
        ArchivedFile(source.name, counts[mart.name], source.stat().st_size, _digests(source)[0])
        for mart, source in zip(published, sources, strict=True)
    )
    readme = folder / README_FILE
    readme.write_text(data_dictionary(as_of_date, published), encoding="utf-8")
    inner_manifest = folder / MANIFEST_FILE
    inner_manifest.write_bytes(_json(manifest(as_of_date, files, published)))

    path = folder / ARCHIVE_FILE
    with zipfile.ZipFile(path, "w", allowZip64=True) as archive:
        for source in (readme, inner_manifest, *sources):
            _add(archive, source)

    sha256, md5 = _digests(path)
    return Archive(path, as_of_date, path.stat().st_size, sha256, md5, files)


def _add(archive: zipfile.ZipFile, source: Path) -> None:
    """Copy one file into the zip with the fixed time and mode, one block at a time.

    The size is set before the copy. The zip module then knows whether the entry needs the large
    file form before it writes the header.
    """
    info = zipfile.ZipInfo(source.name, date_time=_FIXED_TIME)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = _FILE_MODE
    info.file_size = source.stat().st_size
    with source.open("rb") as reader, archive.open(info, "w") as writer:
        shutil.copyfileobj(reader, writer, _BLOCK)


def _digests(path: Path) -> tuple[str, str]:
    """The hex SHA-256 and the hex MD5 of a file, read one block at a time."""
    sha256 = hashlib.sha256()
    md5 = hashlib.md5(usedforsecurity=False)
    with path.open("rb") as reader:
        while block := reader.read(_BLOCK):
            sha256.update(block)
            md5.update(block)
    return sha256.hexdigest(), md5.hexdigest()


def _json(body: dict[str, Any]) -> bytes:
    return (json.dumps(body, indent=2, sort_keys=True) + "\n").encode("utf-8")


def _cell(text: str) -> str:
    """A text that a Markdown table can hold in one cell."""
    return text.replace("|", "\\|").replace("\n", " ")
