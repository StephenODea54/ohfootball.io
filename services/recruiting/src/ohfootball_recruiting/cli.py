"""The command that takes the weekly snapshot of the recruiting classes.

The key of CollegeFootballData comes only from the environment variable CFBD_API_KEY. The command
has no option for it, so the key never shows in a list of processes or in the log of a run.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime
from functools import partial
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .cfbd import DEFAULT_API_URL, fetch_class
from .classes import classes_on_the_field, season_of
from .snapshot import SnapshotFailed, take_snapshot
from .store import DEFAULT_SCHEMA, Store

DEFAULT_DATABASE_URL = "postgresql://im_batman:shhhhhhhhh@localhost:5432/ohfootball"
DEFAULT_TIME_ZONE = "America/New_York"
DEFAULT_CALLS_REMAINING_FLOOR = 100
# The recruiting data of CFBD starts with the class of 2000.
FIRST_SEASON = 2000


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ohfootball-recruiting",
        description="Store a private snapshot of the recruiting data of CollegeFootballData.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    snapshot = subparsers.add_parser(
        "snapshot",
        help="store the recruiting classes that are still in high school, one call for each",
    )
    snapshot.add_argument("--database-url", default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL))
    snapshot.add_argument(
        "--private-schema", default=os.getenv("OHFOOTBALL_PRIVATE_SCHEMA", DEFAULT_SCHEMA)
    )
    snapshot.add_argument("--api-url", default=os.getenv("CFBD_API_URL", DEFAULT_API_URL))
    snapshot.add_argument(
        "--as-of-date",
        type=date.fromisoformat,
        default=None,
        help="the date of the snapshot (default: today in OHFOOTBALL_TIME_ZONE)",
    )
    snapshot.add_argument(
        "--season", type=int, default=None, help="the season (default: the year of the date)"
    )
    snapshot.add_argument(
        "--calls-remaining-floor",
        type=int,
        default=DEFAULT_CALLS_REMAINING_FLOOR,
        help="stop when fewer calls than this are left in the month (default: 100)",
    )
    return parser


def main(argv: list[str] | None = None) -> None:
    arguments = build_parser().parse_args(argv)
    api_key = os.environ.get("CFBD_API_KEY", "").strip()
    if not api_key:
        raise SystemExit(
            "CFBD_API_KEY is required. It is the key of CollegeFootballData that the snapshot "
            "sends."
        )
    try:
        snapshot_date = arguments.as_of_date or today_in_project_time_zone()
        store = Store(arguments.database_url, private_schema=arguments.private_schema)
    except ValueError as error:
        raise SystemExit(str(error)) from None
    season = season_of(snapshot_date) if arguments.season is None else arguments.season
    # A season outside this range gives classes that CFBD cannot have, so it would waste a call.
    if not FIRST_SEASON <= season <= snapshot_date.year + 1:
        raise SystemExit(
            f"the season must be from {FIRST_SEASON} to {snapshot_date.year + 1}, not {season}"
        )
    try:
        summary = take_snapshot(
            snapshot_date=snapshot_date,
            season=season,
            classes=classes_on_the_field(season),
            fetch=partial(fetch_class, api_key=api_key, api_url=arguments.api_url),
            store=store,
            calls_remaining_floor=arguments.calls_remaining_floor,
        )
    except SnapshotFailed as failure:
        print(failure.summary.as_json())
        print(
            f"the recruiting snapshot of {snapshot_date.isoformat()} stopped: {failure}",
            file=sys.stderr,
        )
        raise SystemExit(1) from None
    print(summary.as_json())


def today_in_project_time_zone() -> date:
    time_zone = os.getenv("OHFOOTBALL_TIME_ZONE", DEFAULT_TIME_ZONE)
    try:
        return datetime.now(ZoneInfo(time_zone)).date()
    except ZoneInfoNotFoundError as error:
        raise ValueError(f"invalid OHFOOTBALL_TIME_ZONE: {time_zone!r}") from error


if __name__ == "__main__":
    main()
