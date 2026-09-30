"""Writes the snapshots into the private schema of the warehouse.

One session is one transaction on one connection. The snapshot takes an advisory lock for its
date and class first, so two runs at the same time cannot both call the API for the same class:
the second run waits, then finds the snapshot and keeps it. The transaction reads at the level
READ COMMITTED, so the check after the lock sees a snapshot that the other run committed.

The transaction stays open while the API answers. A server setting
idle_in_transaction_session_timeout that is shorter than the wait for the API would stop it.
"""

from __future__ import annotations

import re
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date
from typing import Any

from .records import typed_fields, without_nul

DEFAULT_SCHEMA = "ohfootball_private"
_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")


class StoreError(Exception):
    """The warehouse did not take a snapshot."""


class StoreNotReady(StoreError):
    """The tables of the snapshots do not exist, because the migrations did not run."""


@dataclass(frozen=True, slots=True)
class Snapshot:
    snapshot_date: date
    class_year: int
    season: int
    source_url: str
    record_count: int
    calls_remaining: int | None


class Store:
    def __init__(self, database_url: str, *, private_schema: str = DEFAULT_SCHEMA) -> None:
        if not _IDENTIFIER.fullmatch(private_schema):
            raise ValueError(f"invalid private schema: {private_schema!r}")
        self.database_url = database_url
        self.private_schema = private_schema

    @contextmanager
    def session(self) -> Iterator[Session]:
        """Opens one transaction. It commits at the end and rolls back on any error."""
        import psycopg

        try:
            with psycopg.connect(self.database_url) as connection:
                connection.isolation_level = psycopg.IsolationLevel.READ_COMMITTED
                with connection.transaction():
                    yield Session(connection, self.private_schema)
        except psycopg.errors.UndefinedTable:
            raise StoreNotReady(
                f"the tables of {self.private_schema} are missing. Run the migrations first."
            ) from None
        except psycopg.Error as error:
            raise StoreError(f"the warehouse refused the snapshot: {_first_line(error)}") from None


class Session:
    def __init__(self, connection: Any, private_schema: str) -> None:
        self.connection = connection
        self.snapshots = f"{private_schema}.recruiting_snapshots"
        self.recruits = f"{private_schema}.recruits"

    def lock(self, snapshot_date: date, class_year: int) -> None:
        """Waits until no other transaction holds the snapshot of this date and class."""
        self.connection.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))",
            (f"recruiting:{snapshot_date.isoformat()}:{class_year}",),
        )

    def is_stored(self, snapshot_date: date, class_year: int) -> bool:
        row = self.connection.execute(
            f"SELECT 1 FROM {self.snapshots} WHERE snapshot_date = %s AND class_year = %s",
            (snapshot_date, class_year),
        ).fetchone()
        return row is not None

    def write(self, snapshot: Snapshot, records: Sequence[dict[str, Any]]) -> int:
        """Writes one snapshot and its records, and gives the number of records."""
        from psycopg.types.json import Jsonb

        self.connection.execute(
            f"""
            INSERT INTO {self.snapshots} (
                snapshot_date, class_year, season, source_url, record_count, calls_remaining
            ) VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                snapshot.snapshot_date,
                snapshot.class_year,
                snapshot.season,
                snapshot.source_url,
                snapshot.record_count,
                snapshot.calls_remaining,
            ),
        )
        rows = []
        for ordinal, record in enumerate(records):
            fields = typed_fields(record)
            rows.append(
                (
                    snapshot.snapshot_date,
                    snapshot.class_year,
                    ordinal,
                    fields.cfbd_id,
                    fields.athlete_id,
                    fields.name,
                    fields.school,
                    fields.city,
                    fields.state_province,
                    fields.position,
                    fields.stars,
                    fields.rating,
                    fields.ranking,
                    fields.committed_to,
                    Jsonb(without_nul(record)),
                )
            )
        if rows:
            with self.connection.cursor() as cursor:
                cursor.executemany(
                    f"""
                    INSERT INTO {self.recruits} (
                        snapshot_date, class_year, ordinal, cfbd_id, athlete_id, name, school,
                        city, state_province, position, stars, rating, ranking, committed_to,
                        record
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    rows,
                )
        return len(rows)


def _first_line(error: Exception) -> str:
    text = str(error).strip()
    return text.splitlines()[0] if text else type(error).__name__
