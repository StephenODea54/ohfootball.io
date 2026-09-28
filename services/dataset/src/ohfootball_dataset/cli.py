"""Command-line entry points for the public dataset.

`export` writes the files and stops, which is what a check on a laptop needs. `publish` writes them
to a directory that lasts as long as the upload and sends them to Kaggle, which is what the weekly
run does.
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .kaggle_dataset import publish, write_metadata
from .marts import MARTS, export_marts

DEFAULT_DATABASE_URL = "postgresql://im_batman:shhhhhhhhh@localhost:5432/ohfootball"
DEFAULT_TIME_ZONE = "America/New_York"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ohfootball-dataset",
        description="Export the marts and publish them to Kaggle.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    export = subparsers.add_parser("export", help="write the files and send nothing")
    _add_common_arguments(export)
    export.add_argument("--directory", required=True)

    publication = subparsers.add_parser("publish", help="write the files and publish them")
    _add_common_arguments(publication)
    publication.add_argument("--dataset", default=os.getenv("KAGGLE_DATASET"))
    publication.add_argument("--as-of-date", type=date.fromisoformat, default=None)
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


def _export(arguments: argparse.Namespace) -> None:
    counts = export_marts(
        arguments.database_url,
        arguments.directory,
        marts_schema=arguments.marts_schema,
    )
    print(json.dumps({"directory": arguments.directory, "rows": counts}, indent=2, sort_keys=True))


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
                "files": len(MARTS),
                "invalid_tags": list(publication.invalid_tags),
                "metadata": publication.metadata,
                "rows": counts,
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
