"""Checks how the migrations find the warehouse and the migration files."""

from __future__ import annotations

import sys
import types
import unittest
from pathlib import Path
from unittest import mock

import sustained_config

POSTGRES_DIRECTORY = Path(__file__).resolve().parent.parent


class TheConnectionString(unittest.TestCase):
    def test_is_read_from_database_url(self) -> None:
        url = "postgresql://user:password@postgres:5432/ohfootball?sslmode=disable"

        self.assertEqual(sustained_config.database_url({"DATABASE_URL": url}), url)

    def test_loses_the_spaces_around_it(self) -> None:
        url = sustained_config.database_url({"DATABASE_URL": "  postgresql://postgres/db\n"})

        self.assertEqual(url, "postgresql://postgres/db")

    def test_is_required(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "DATABASE_URL is required"):
            sustained_config.database_url({})

    def test_is_required_when_it_holds_only_spaces(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "DATABASE_URL is required"):
            sustained_config.database_url({"DATABASE_URL": "   "})

    def test_is_read_from_the_environment_when_no_mapping_is_given(self) -> None:
        with mock.patch.dict("os.environ", {"DATABASE_URL": "postgresql://postgres/db"}):
            self.assertEqual(sustained_config.database_url(), "postgresql://postgres/db")


class TheConnection(unittest.TestCase):
    def test_is_opened_with_the_connection_string(self) -> None:
        psycopg = types.ModuleType("psycopg")
        psycopg.connect = mock.Mock(return_value="connection")
        environment = {"DATABASE_URL": "postgresql://postgres/db"}

        with mock.patch.dict(sys.modules, {"psycopg": psycopg}):
            with mock.patch.dict("os.environ", environment):
                connection = sustained_config.get_connection()

        self.assertEqual(connection, "connection")
        psycopg.connect.assert_called_once_with("postgresql://postgres/db")

    def test_is_not_opened_without_a_connection_string(self) -> None:
        psycopg = types.ModuleType("psycopg")
        psycopg.connect = mock.Mock()

        with mock.patch.dict(sys.modules, {"psycopg": psycopg}):
            with mock.patch.dict("os.environ", {}, clear=True):
                with self.assertRaises(RuntimeError):
                    sustained_config.get_connection()

        psycopg.connect.assert_not_called()


class TheSettings(unittest.TestCase):
    def test_name_the_migrations_directory_beside_the_module(self) -> None:
        self.assertEqual(sustained_config.migrations_dir, POSTGRES_DIRECTORY / "migrations")
        self.assertTrue(sustained_config.migrations_dir.is_dir())

    def test_name_postgres(self) -> None:
        self.assertEqual(sustained_config.dialect, "postgres")


if __name__ == "__main__":
    unittest.main()
