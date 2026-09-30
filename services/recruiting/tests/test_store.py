import sys
import unittest
from datetime import date
from unittest import mock

from fakes import Connection, fake_psycopg

from ohfootball_recruiting.store import Snapshot, Store, StoreError, StoreNotReady

DAY = date(2026, 9, 29)
SNAPSHOT = Snapshot(
    snapshot_date=DAY,
    class_year=2027,
    season=2026,
    source_url="http://api.test/recruiting/players?year=2027",
    record_count=2,
    calls_remaining=987,
)
RECORDS = [
    {"id": "1", "athleteId": "10", "name": "A\x00", "school": "Elder", "stars": 4, "rating": 0.9},
    {"name": "B"},
]


class TheStore(unittest.TestCase):
    def run_session(self, connection: Connection, work):
        modules = fake_psycopg(connection)
        with mock.patch.dict(sys.modules, modules):
            with Store("postgresql://db/ohfootball").session() as session:
                work(session)
        return modules["psycopg"]

    def test_refuses_a_schema_that_is_not_a_name(self) -> None:
        for schema in ("", "Private", "a;drop", "1a", "a.b"):
            with self.subTest(schema=schema):
                with self.assertRaises(ValueError):
                    Store("postgresql://db", private_schema=schema)

    def test_connects_to_the_url_and_commits_one_transaction(self) -> None:
        connection = Connection()
        psycopg = self.run_session(connection, lambda session: None)

        self.assertEqual(psycopg.connected, ["postgresql://db/ohfootball"])
        self.assertEqual(connection.transactions, ["commit"])
        self.assertEqual(connection.isolation_level, "read committed")

    def test_locks_the_date_and_the_class(self) -> None:
        connection = Connection()
        self.run_session(connection, lambda session: session.lock(DAY, 2027))

        self.assertEqual(
            connection.statements,
            [
                (
                    "execute",
                    "SELECT pg_advisory_xact_lock(hashtext(%s))",
                    ("recruiting:2026-09-29:2027",),
                )
            ],
        )

    def test_finds_a_stored_snapshot(self) -> None:
        for found in (True, False):
            with self.subTest(found=found):
                connection = Connection(found=found)
                answers: list[bool] = []

                def check(session, answers=answers) -> None:
                    answers.append(session.is_stored(DAY, 2027))

                self.run_session(connection, check)

                self.assertEqual(answers, [found])
                _, sql, params = connection.statements[0]
                self.assertIn("FROM ohfootball_private.recruiting_snapshots", sql)
                self.assertEqual(params, (DAY, 2027))

    def test_writes_the_snapshot_then_every_record_in_order(self) -> None:
        connection = Connection()
        written = []
        modules = fake_psycopg(connection)
        with mock.patch.dict(sys.modules, modules):
            with Store("postgresql://db").session() as session:
                written.append(session.write(SNAPSHOT, RECORDS))
        Jsonb = modules["psycopg.types.json"].Jsonb

        self.assertEqual(written, [2])
        (_, snapshot_sql, snapshot_params), (_, recruits_sql, rows) = connection.statements
        self.assertIn("INSERT INTO ohfootball_private.recruiting_snapshots", snapshot_sql)
        self.assertEqual(snapshot_params, (DAY, 2027, 2026, SNAPSHOT.source_url, 2, 987))
        self.assertIn("INSERT INTO ohfootball_private.recruits", recruits_sql)
        self.assertEqual(
            rows[0],
            (
                DAY,
                2027,
                0,
                1,
                10,
                "A",
                "Elder",
                None,
                None,
                None,
                4,
                0.9,
                None,
                None,
                Jsonb({**RECORDS[0], "name": "A"}),
            ),
        )
        self.assertEqual(rows[1][2], 1)
        self.assertEqual(rows[1][5], "B")
        self.assertEqual(rows[1][14], Jsonb({"name": "B"}))

    def test_writes_only_the_snapshot_of_an_empty_class(self) -> None:
        connection = Connection()
        written = []
        self.run_session(connection, lambda session: written.append(session.write(SNAPSHOT, [])))

        self.assertEqual(written, [0])
        self.assertEqual([statement[0] for statement in connection.statements], ["execute"])

    def test_uses_the_schema_that_it_is_given(self) -> None:
        connection = Connection()
        with mock.patch.dict(sys.modules, fake_psycopg(connection)):
            with Store("postgresql://db", private_schema="other").session() as session:
                session.is_stored(DAY, 2027)

        self.assertIn("FROM other.recruiting_snapshots", connection.statements[0][1])

    def test_rolls_back_when_the_work_fails(self) -> None:
        connection = Connection()

        def fail(session):
            raise RuntimeError("stop")

        with self.assertRaises(RuntimeError):
            self.run_session(connection, fail)
        self.assertEqual(connection.transactions, ["rollback"])


class TheErrors(unittest.TestCase):
    def test_tell_that_the_migrations_did_not_run(self) -> None:
        modules = fake_psycopg(Connection())
        modules["psycopg"].connect = lambda url: Connection(
            error=modules["psycopg.errors"].UndefinedTable('relation "x" does not exist')
        )
        with mock.patch.dict(sys.modules, modules):
            with self.assertRaises(StoreNotReady) as caught:
                with Store("postgresql://db").session() as session:
                    session.is_stored(DAY, 2027)

        self.assertIn("Run the migrations first", str(caught.exception))
        self.assertIsNone(caught.exception.__cause__)

    def test_name_an_error_of_the_connection(self) -> None:
        modules = fake_psycopg(Connection())

        def refuse(url):
            raise modules["psycopg"].Error("connection failed: password authentication failed")

        modules["psycopg"].connect = refuse
        with mock.patch.dict(sys.modules, modules):
            with self.assertRaises(StoreError) as caught:
                with Store("postgresql://user:secret@db/ohfootball").session():
                    pass

        self.assertIn("password authentication failed", str(caught.exception))
        self.assertNotIn("secret", str(caught.exception))

    def test_name_the_first_line_of_any_other_error_of_the_warehouse(self) -> None:
        modules = fake_psycopg(Connection())
        for text, shown in (("duplicate key\nDETAIL: row", "duplicate key"), ("", "Error")):
            with self.subTest(text=text):
                modules["psycopg"].connect = lambda url, text=text: Connection(
                    error=modules["psycopg"].Error(text)
                )
                with mock.patch.dict(sys.modules, modules):
                    with self.assertRaises(StoreError) as caught:
                        with Store("postgresql://db").session() as session:
                            session.lock(DAY, 2027)

                self.assertEqual(
                    str(caught.exception), f"the warehouse refused the snapshot: {shown}"
                )
                self.assertNotIsInstance(caught.exception, StoreNotReady)


if __name__ == "__main__":
    unittest.main()
