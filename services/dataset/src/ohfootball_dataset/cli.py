"""Command-line entry points for the public dataset.

`export` writes the files and stops, which is what a check on a laptop needs. With `--archive` it
also writes the zip that people download. `publish` writes the files to a directory that lasts as
long as the upload and sends them to Kaggle. `publish-download` writes them the same way, zips them,
and sends the zip to the R2 bucket. The weekly run does both.
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .archive import DOWNLOAD_URL, build_archive
from .kaggle_dataset import publish, write_metadata
from .marts import MARTS, export_marts
from .r2_bucket import BUCKET_VARIABLE, bucket_from_environment, r2_client, upload_snapshot

DEFAULT_DATABASE_URL = "postgresql://im_batman:shhhhhhhhh@localhost:5432/ohfootball"
DEFAULT_TIME_ZONE = "America/New_York"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ohfootball-dataset",
        description="Export the marts, publish them to Kaggle, and publish them as a download.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    export = subparsers.add_parser("export", help="write the files and send nothing")
    _add_common_arguments(export)
    export.add_argument("--directory", required=True)
    export.add_argument("--archive", action="store_true", help="also write the zip")

    publication = subparsers.add_parser("publish", help="write the files and publish them")
    _add_common_arguments(publication)
    publication.add_argument("--dataset", default=os.getenv("KAGGLE_DATASET"))
    publication.add_argument("--as-of-date", type=date.fromisoformat, default=None)

    download = subparsers.add_parser(
        "publish-download", help="write the files, zip them, and upload the zip to R2"
    )
    _add_common_arguments(download)
    download.add_argument("--bucket", default=os.getenv(BUCKET_VARIABLE))
    return parser


def _add_common_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL),
    )
    parser.add_argument(
        "--marts-schema",
        default=os.getenv("OHFOOTBALL_MARTS_SCHEMA", "ohfootball_marts"),
    )


def main() -> None:
    arguments = build_parser().parse_args()
    if arguments.command == "export":
        _export(arguments)
    elif arguments.command == "publish":
        _publish(arguments)
    elif arguments.command == "publish-download":
        _publish_download(arguments)


def _export(arguments: argparse.Namespace) -> None:
    counts = export_marts(
        arguments.database_url,
        arguments.directory,
        marts_schema=arguments.marts_schema,
    )
    body: dict[str, object] = {"directory": arguments.directory, "rows": counts}
    if arguments.archive:
        archive = build_archive(arguments.directory, _today_in_project_time_zone(), counts=counts)
        body["archive"] = {
            "bytes": archive.bytes,
            "path": str(archive.path),
            "sha256": archive.sha256,
        }
    print(json.dumps(body, indent=2, sort_keys=True))


def _publish(arguments: argparse.Namespace) -> None:
    if not arguments.dataset:
        raise SystemExit("name the dataset with --dataset or KAGGLE_DATASET")
    as_of_date = arguments.as_of_date or _today_in_project_time_zone()

    with tempfile.TemporaryDirectory(prefix="ohfootball-dataset-") as directory:
        counts = export_marts(
            arguments.database_url,
            directory,
            marts_schema=arguments.marts_schema,
        )
        if not any(counts.values()):
            raise SystemExit("the marts hold no rows, so nothing was published")
        write_metadata(directory, arguments.dataset)
        publication = publish(
            directory,
            arguments.dataset,
            version_notes=f"marts as of {as_of_date.isoformat()}",
        )

    print(
        json.dumps(
            {
                "action": publication.action,
                "as_of_date": as_of_date.isoformat(),
                "dataset": arguments.dataset,
                "descriptions": publication.descriptions,
                "files": len(MARTS),
                "invalid_tags": list(publication.invalid_tags),
                "metadata": publication.metadata,
                "missing_descriptions": list(publication.missing_descriptions),
                "read_error": publication.read_error,
                "rows": counts,
            },
            indent=2,
            sort_keys=True,
        )
    )


def _publish_download(arguments: argparse.Namespace) -> None:
    # The settings are read before the export, so a run that lacks one stops at once.
    try:
        bucket = bucket_from_environment(name=arguments.bucket)
    except ValueError as error:
        raise SystemExit(str(error)) from None
    as_of_date = _today_in_project_time_zone()

    with tempfile.TemporaryDirectory(prefix="ohfootball-download-") as directory:
        counts = export_marts(
            arguments.database_url,
            directory,
            marts_schema=arguments.marts_schema,
        )
        # Stricter than the check before a Kaggle version. A version adds to what Kaggle holds,
        # but latest/ replaces the zip of the week before.
        empty = [name for name, rows in counts.items() if not rows]
        if empty:
            raise SystemExit(f"{', '.join(empty)} holds no rows, so nothing was uploaded")
        archive = build_archive(directory, as_of_date, counts=counts)
        upload = upload_snapshot(r2_client(bucket), bucket.name, archive)

    print(
        json.dumps(
            {
                "as_of_date": as_of_date.isoformat(),
                "bucket": bucket.name,
                "bytes": archive.bytes,
                "files": len(MARTS),
                "objects": dict(upload.objects),
                "rows": counts,
                "sha256": archive.sha256,
                "snapshot_url": f"{DOWNLOAD_URL}/{upload.snapshot_key}",
                "snapshots": len(upload.snapshots),
                "url": f"{DOWNLOAD_URL}/{upload.latest_key}",
            },
            indent=2,
            sort_keys=True,
        )
    )


def _today_in_project_time_zone() -> date:
    time_zone = os.getenv("OHFOOTBALL_TIME_ZONE", DEFAULT_TIME_ZONE)
    try:
        return datetime.now(ZoneInfo(time_zone)).date()
    except ZoneInfoNotFoundError as error:
        raise ValueError(f"invalid OHFOOTBALL_TIME_ZONE: {time_zone!r}") from error


if __name__ == "__main__":
    main()
