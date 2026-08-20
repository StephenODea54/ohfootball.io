"""Tests for the published set, the statements it builds, and the export."""

from __future__ import annotations

import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

from ohfootball_dataset.marts import MARTS, Column, Mart, export_marts

SCHEMA = "ohfootball_marts"


class FakeCopy:
    """Stands in for the copy of one mart, handing back the blocks it was given."""

    def __init__(self, blocks: list[bytes]) -> None:
        self.blocks = blocks

    def __enter__(self) -> "FakeCopy":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def __iter__(self):
        return iter(self.blocks)


class FakeCursor:
    def __init__(self, rows: dict[str, int]) -> None:
        self.rows = rows
        self.copied: list[str] = []
        self.counted: list[str] = []
        self._pending = 0

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def copy(self, statement: str) -> FakeCopy:
        self.copied.append(statement)
        name = self._mart_of(statement)
        header = ",".join(_mart(name).column_names).encode()
        return FakeCopy([header + b"\n", b"one,row\n"])

    def execute(self, statement: str) -> "FakeCursor":
        self.counted.append(statement)
        self._pending = self.rows[self._mart_of(statement)]
        return self

    def fetchone(self) -> tuple[int]:
        return (self._pending,)

    def _mart_of(self, statement: str) -> str:
        for mart in MARTS:
            if f"{SCHEMA}.{mart.name}\n" in statement or statement.endswith(
                f"{SCHEMA}.{mart.name}"
            ):
                return mart.name
        raise AssertionError(f"no mart named in {statement!r}")


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self._cursor = cursor

    def __enter__(self) -> "FakeConnection":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def cursor(self) -> FakeCursor:
        return self._cursor


def _mart(name: str) -> Mart:
    return next(mart for mart in MARTS if mart.name == name)


def _fake_psycopg(cursor: FakeCursor) -> types.ModuleType:
    module = types.ModuleType("psycopg")
    module.connect = lambda *_args, **_kwargs: FakeConnection(cursor)  # type: ignore[attr-defined]
    return module


class ThePublishedSet(unittest.TestCase):
    def test_names_five_marts_once_each(self) -> None:
        names = [mart.name for mart in MARTS]
        self.assertEqual(len(names), len(set(names)))
        self.assertEqual(
            set(names),
            {
                "dim_teams",
                "dim_dates",
                "fct_games",
                "fct_team_elo_ratings",
                "fct_game_predictions",
            },
        )

    def test_carries_the_current_version_of_the_marts_that_hold_versions(self) -> None:
        versioned = {mart.name for mart in MARTS if mart.current_only}
        self.assertEqual(versioned, {"dim_teams", "fct_games"})

    def test_publishes_no_column_of_the_version_bookkeeping(self) -> None:
        for mart in MARTS:
            for name in ("valid_from", "valid_to", "is_current", "calculated_at"):
                self.assertNotIn(name, mart.column_names, mart.name)

    def test_writes_every_key_date_and_flag_as_text_a_reader_can_use(self) -> None:
        # A date key is a whole number of the form YYYYMMDD and is published as it stands. The
        # other keys are UUIDs, and a date is a date, so both leave the warehouse as text.
        for mart in MARTS:
            for column in mart.columns:
                selected = column.select()
                if column.name.endswith("_key") and not column.name.endswith("date_key"):
                    self.assertIn("::text", selected, column.name)
                if column.name.endswith("_date") or column.name == "date_day":
                    self.assertIn("::text", selected, column.name)
                if column.name.startswith("is_"):
                    self.assertIn("::int", selected, column.name)


class TheStatements(unittest.TestCase):
    def test_select_the_named_columns_in_order(self) -> None:
        query = _mart("fct_team_elo_ratings").query(SCHEMA)
        self.assertIn("team_key::text AS team_key", query)
        self.assertIn("as_of_date::text AS as_of_date", query)
        self.assertIn("elo_rating AS elo_rating", query)
        self.assertIn(f"FROM {SCHEMA}.fct_team_elo_ratings", query)
        self.assertIn("ORDER BY season, as_of_date, team_key", query)

    def test_filter_only_the_marts_that_hold_versions(self) -> None:
        self.assertIn("WHERE is_current", _mart("fct_games").query(SCHEMA))
        self.assertNotIn("WHERE", _mart("dim_dates").query(SCHEMA))

    def test_count_the_same_rows_the_copy_writes(self) -> None:
        self.assertEqual(
            _mart("fct_games").count_query(SCHEMA),
            f"SELECT COUNT(*) FROM {SCHEMA}.fct_games\n        WHERE is_current",
        )
        self.assertEqual(
            _mart("dim_dates").count_query(SCHEMA),
            f"SELECT COUNT(*) FROM {SCHEMA}.dim_dates",
        )

    def test_ask_for_csv_with_a_header(self) -> None:
        statement = _mart("dim_teams").copy_statement(SCHEMA)
        self.assertTrue(statement.startswith("COPY ("))
        self.assertTrue(statement.endswith("TO STDOUT WITH (FORMAT csv, HEADER true)"))

    def test_refuse_a_schema_that_is_not_an_identifier(self) -> None:
        for schema in ("ohfootball marts", 'marts"; DROP TABLE fct_games; --', "1marts", ""):
            with self.assertRaises(ValueError):
                _mart("dim_dates").query(schema)

    def test_refuse_a_mart_a_column_or_an_order_that_is_not_an_identifier(self) -> None:
        with self.assertRaises(ValueError):
            Mart(name="dim teams", columns=(Column("season"),), order_by=("season",)).query(SCHEMA)
        with self.assertRaises(ValueError):
            Mart(
                name="dim_dates",
                columns=(Column("season; DROP TABLE fct_games"),),
                order_by=("season",),
            ).query(SCHEMA)
        with self.assertRaises(ValueError):
            Mart(name="dim_dates", columns=(Column("season"),), order_by=("1",)).query(SCHEMA)

    def test_refuse_a_mart_with_no_order(self) -> None:
        with self.assertRaises(ValueError):
            Mart(name="dim_dates", columns=(Column("season"),), order_by=()).query(SCHEMA)


class TheExport(unittest.TestCase):
    def test_writes_one_file_per_mart_and_reports_the_rows(self) -> None:
        rows = {mart.name: index + 1 for index, mart in enumerate(MARTS)}
        cursor = FakeCursor(rows)
        with tempfile.TemporaryDirectory() as directory:
            with mock.patch.dict(sys.modules, {"psycopg": _fake_psycopg(cursor)}):
                counts = export_marts("postgresql://localhost/none", directory, marts_schema=SCHEMA)
            self.assertEqual(counts, rows)
            for mart in MARTS:
                path = Path(directory) / f"{mart.name}.csv"
                self.assertTrue(path.exists(), mart.name)
                first_line = path.read_text(encoding="utf-8").splitlines()[0]
                self.assertEqual(first_line.split(","), list(mart.column_names))
        self.assertEqual(len(cursor.copied), len(MARTS))
        self.assertEqual(len(cursor.counted), len(MARTS))

    def test_writes_only_the_marts_it_is_given(self) -> None:
        cursor = FakeCursor({"dim_dates": 7})
        with tempfile.TemporaryDirectory() as directory:
            with mock.patch.dict(sys.modules, {"psycopg": _fake_psycopg(cursor)}):
                counts = export_marts(
                    "postgresql://localhost/none",
                    Path(directory),
                    marts_schema=SCHEMA,
                    marts=(_mart("dim_dates"),),
                )
            self.assertEqual(counts, {"dim_dates": 7})
            self.assertEqual(sorted(path.name for path in Path(directory).iterdir()), ["dim_dates.csv"])

    def test_refuses_a_directory_that_does_not_exist(self) -> None:
        with self.assertRaises(ValueError):
            export_marts("postgresql://localhost/none", "/no/such/directory")


if __name__ == "__main__":
    unittest.main()
