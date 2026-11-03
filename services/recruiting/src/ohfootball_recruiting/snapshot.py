"""Takes the weekly snapshot: one stored answer for each class on the field.

A class that is already stored for the date is kept, and it costs no call. A class costs one call
when the API answers, and up to ATTEMPTS calls when the network or the server fails for a short
time. The first error that stays stops the snapshot, because the weekly run must fail when a
source fails. A later run on the same date then calls only for the classes that are missing. The
snapshot also stops when the API reports fewer calls left than the floor, so the key is not used
up by a run that goes on.
"""

from __future__ import annotations

import json
import sys
import time
from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Literal, Protocol

from .cfbd import Answer, FetchError
from .store import Snapshot, StoreError

# The waits before the second and the third call for one class. A server that is slow for a minute
# is then asked again after it recovers. There is one more call than there are waits.
WAITS_SECONDS = (10, 30)
ATTEMPTS = len(WAITS_SECONDS) + 1


class Session(Protocol):
    def lock(self, snapshot_date: date, class_year: int) -> None: ...

    def is_stored(self, snapshot_date: date, class_year: int) -> bool: ...

    def write(self, snapshot: Snapshot, records: Sequence[dict]) -> int: ...


class Store(Protocol):
    def session(self): ...


@dataclass(slots=True)
class ClassResult:
    class_year: int
    status: Literal["stored", "kept"]
    records: int | None


@dataclass(slots=True)
class Summary:
    snapshot_date: date
    season: int
    calls_made: int = 0
    calls_remaining: int | None = None
    classes: list[ClassResult] = field(default_factory=list)
    error: str | None = None

    def as_json(self) -> str:
        data = asdict(self)
        data["snapshot_date"] = self.snapshot_date.isoformat()
        return json.dumps(data, indent=2, sort_keys=True)


class SnapshotFailed(Exception):
    """The snapshot stopped. The summary tells what was done before the stop."""

    def __init__(self, summary: Summary) -> None:
        super().__init__(summary.error)
        self.summary = summary


def take_snapshot(
    *,
    snapshot_date: date,
    season: int,
    classes: Sequence[int],
    fetch: Callable[[int], Answer],
    store: Store,
    calls_remaining_floor: int,
    sleep: Callable[[float], None] | None = None,
    warn: Callable[[str], None] | None = None,
) -> Summary:
    """Stores each class in turn. sleep waits before a call is sent again, and warn reports the
    fault that caused the wait. By default they are time.sleep and a line on standard error."""
    summary = Summary(snapshot_date=snapshot_date, season=season)
    sleep = sleep or time.sleep
    warn = warn or _print_to_stderr
    for position, class_year in enumerate(classes):
        try:
            result, left = _take_class(
                summary, class_year, fetch=fetch, store=store, sleep=sleep, warn=warn
            )
        except (FetchError, StoreError) as error:
            summary.error = str(error)
            raise SnapshotFailed(summary) from None
        summary.classes.append(result)
        if left is not None and left < calls_remaining_floor and position < len(classes) - 1:
            summary.error = (
                f"CollegeFootballData reports {left} calls left this month, fewer than the "
                f"floor of {calls_remaining_floor}"
            )
            raise SnapshotFailed(summary)
    return summary


def _take_class(
    summary: Summary,
    class_year: int,
    *,
    fetch: Callable[[int], Answer],
    store: Store,
    sleep: Callable[[float], None],
    warn: Callable[[str], None],
) -> tuple[ClassResult, int | None]:
    """Stores one class and gives the calls left that its answer reports.

    Each attempt opens its own session. So no lock and no transaction stays open during a wait, and
    a class that another run stored during the wait is kept.
    """
    attempt = 1
    while True:
        try:
            return _attempt(summary, class_year, fetch=fetch, store=store)
        except FetchError as error:
            if not error.transient:
                raise
            failure = error
        # The error is raised after the except block, so it carries no earlier exception.
        if attempt == ATTEMPTS:
            raise FetchError(f"{failure}, after {ATTEMPTS} calls", transient=True)
        wait = WAITS_SECONDS[attempt - 1]
        warn(f"{failure}. The call is sent again in {wait} seconds.")
        sleep(wait)
        attempt += 1


def _attempt(
    summary: Summary, class_year: int, *, fetch: Callable[[int], Answer], store: Store
) -> tuple[ClassResult, int | None]:
    with store.session() as session:
        session.lock(summary.snapshot_date, class_year)
        if session.is_stored(summary.snapshot_date, class_year):
            return ClassResult(class_year, "kept", None), None
        # A call counts before its answer, because a failed call still costs one.
        summary.calls_made += 1
        answer = fetch(class_year)
        if answer.calls_remaining is not None:
            summary.calls_remaining = answer.calls_remaining
        written = session.write(
            Snapshot(
                snapshot_date=summary.snapshot_date,
                class_year=class_year,
                season=summary.season,
                source_url=answer.url,
                record_count=len(answer.records),
                calls_remaining=answer.calls_remaining,
            ),
            answer.records,
        )
    return ClassResult(class_year, "stored", written), answer.calls_remaining


def _print_to_stderr(message: str) -> None:
    print(message, file=sys.stderr)
