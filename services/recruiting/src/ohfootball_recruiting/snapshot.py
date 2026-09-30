"""Takes the weekly snapshot: one call and one stored answer for each class on the field.

A class that is already stored for the date is kept, and it costs no call. The first error stops
the snapshot, because the weekly run must fail when a source fails. A later run on the same date
then calls only for the classes that are missing. The snapshot also stops when the API reports
fewer calls left than the floor, so the key is not used up by a run that goes on.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Literal, Protocol

from .cfbd import Answer, FetchError
from .store import Snapshot, StoreError


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
) -> Summary:
    summary = Summary(snapshot_date=snapshot_date, season=season)
    for position, class_year in enumerate(classes):
        answer = None
        try:
            with store.session() as session:
                session.lock(snapshot_date, class_year)
                if session.is_stored(snapshot_date, class_year):
                    summary.classes.append(ClassResult(class_year, "kept", None))
                    continue
                # A call counts before its answer, because a failed call still costs one.
                summary.calls_made += 1
                answer = fetch(class_year)
                if answer.calls_remaining is not None:
                    summary.calls_remaining = answer.calls_remaining
                written = session.write(
                    Snapshot(
                        snapshot_date=snapshot_date,
                        class_year=class_year,
                        season=season,
                        source_url=answer.url,
                        record_count=len(answer.records),
                        calls_remaining=answer.calls_remaining,
                    ),
                    answer.records,
                )
        except (FetchError, StoreError) as error:
            summary.error = str(error)
            raise SnapshotFailed(summary) from None
        summary.classes.append(ClassResult(class_year, "stored", written))
        left = answer.calls_remaining
        if left is not None and left < calls_remaining_floor and position < len(classes) - 1:
            summary.error = (
                f"CollegeFootballData reports {left} calls left this month, fewer than the "
                f"floor of {calls_remaining_floor}"
            )
            raise SnapshotFailed(summary)
    return summary
