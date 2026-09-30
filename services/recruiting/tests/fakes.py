"""Stand-ins for psycopg, the store and the API, shared by the tests."""

from __future__ import annotations

import types
from contextlib import contextmanager
from datetime import date

from ohfootball_recruiting.cfbd import Answer, FetchError
from ohfootball_recruiting.store import Snapshot, StoreError


class Result:
    def __init__(self, row: tuple | None) -> None:
        self.row = row

    def fetchone(self) -> tuple | None:
        return self.row


class Cursor:
    def __init__(self, connection: Connection) -> None:
        self.connection = connection

    def __enter__(self) -> Cursor:
        return self

    def __exit__(self, *details: object) -> None:
        return None

    def executemany(self, sql: str, rows: list[tuple]) -> None:
        self.connection.statements.append(("executemany", " ".join(sql.split()), rows))


class Connection:
    """Keeps each statement. A SELECT 1 finds a row when `found` is set."""

    def __init__(self, found: bool = False, error: Exception | None = None) -> None:
        self.found, self.error = found, error
        self.isolation_level = None
        self.statements: list[tuple] = []
        self.transactions: list[str] = []

    def __enter__(self) -> Connection:
        return self

    def __exit__(self, *details: object) -> None:
        return None

    @contextmanager
    def transaction(self):
        try:
            yield
        except BaseException:
            self.transactions.append("rollback")
            raise
        self.transactions.append("commit")

    def execute(self, sql: str, params: tuple = ()) -> Result:
        if self.error is not None:
            raise self.error
        text = " ".join(sql.split())
        self.statements.append(("execute", text, params))
        return Result((1,) if self.found and text.startswith("SELECT 1") else None)

    def cursor(self) -> Cursor:
        return Cursor(self)


def fake_psycopg(connection: Connection) -> dict[str, types.ModuleType]:
    """Builds the modules that the store imports, for mock.patch.dict(sys.modules, ...)."""
    psycopg = types.ModuleType("psycopg")
    errors = types.ModuleType("psycopg.errors")
    types_module = types.ModuleType("psycopg.types")
    json_module = types.ModuleType("psycopg.types.json")

    class Error(Exception):
        pass

    class UndefinedTable(Error):
        pass

    class Jsonb:
        def __init__(self, value: object) -> None:
            self.value = value

        def __eq__(self, other: object) -> bool:
            return isinstance(other, Jsonb) and other.value == self.value

    errors.UndefinedTable = UndefinedTable
    psycopg.Error = Error
    psycopg.IsolationLevel = types.SimpleNamespace(READ_COMMITTED="read committed")
    psycopg.errors = errors
    psycopg.connected = []

    def connect(url: str) -> Connection:
        psycopg.connected.append(url)
        return connection

    psycopg.connect = connect
    json_module.Jsonb = Jsonb
    types_module.json = json_module
    psycopg.types = types_module
    return {
        "psycopg": psycopg,
        "psycopg.errors": errors,
        "psycopg.types": types_module,
        "psycopg.types.json": json_module,
    }


class FakeSession:
    def __init__(self, store: FakeStore) -> None:
        self.store = store

    def lock(self, snapshot_date: date, class_year: int) -> None:
        self.store.events.append(("lock", class_year))

    def is_stored(self, snapshot_date: date, class_year: int) -> bool:
        self.store.events.append(("is_stored", class_year))
        return (snapshot_date, class_year) in self.store.stored

    def write(self, snapshot: Snapshot, records: list[dict]) -> int:
        self.store.events.append(("write", snapshot.class_year))
        if snapshot.class_year in self.store.refuse:
            raise StoreError(f"the warehouse refused the snapshot: class {snapshot.class_year}")
        self.store.pending.append((snapshot, records))
        return len(records)


class FakeStore:
    """Keeps a snapshot only when its session ends without an error, like one transaction."""

    def __init__(self, stored: set[tuple[date, int]] | None = None, refuse=()) -> None:
        self.stored = set(stored or ())
        self.refuse = set(refuse)
        self.events: list[tuple] = []
        self.written: list[tuple[Snapshot, list[dict]]] = []
        self.pending: list = []
        self.rollbacks = 0

    @contextmanager
    def session(self):
        self.pending = []
        try:
            yield FakeSession(self)
        except BaseException:
            self.rollbacks += 1
            raise
        for snapshot, records in self.pending:
            self.stored.add((snapshot.snapshot_date, snapshot.class_year))
            self.written.append((snapshot, records))


class FakeApi:
    """Gives one answer for each class, or raises FetchError for the classes in `fail`."""

    def __init__(self, remaining: dict[int, int | None] | None = None, fail=(), events=None):
        self.remaining = remaining or {}
        self.fail = set(fail)
        self.calls: list[int] = []
        self.events = events

    def __call__(self, class_year: int) -> Answer:
        self.calls.append(class_year)
        if self.events is not None:
            self.events.append(("fetch", class_year))
        if class_year in self.fail:
            raise FetchError(f"CollegeFootballData answered 503 for class {class_year}")
        return Answer(
            url=f"http://api.test/recruiting/players?year={class_year}",
            records=[{"id": str(class_year * 10 + n)} for n in range(2)],
            calls_remaining=self.remaining.get(class_year, 900),
        )
