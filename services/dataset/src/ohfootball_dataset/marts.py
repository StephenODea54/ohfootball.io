"""The marts the public dataset carries, and how each one becomes a CSV file.

Every column is named here rather than taken with a star, so the shape of the published dataset is
read from this file alone. The casts match the ones the API snapshot uses: a key and a date leave
the warehouse as text, and a flag leaves it as 0 or 1. That keeps a CSV column readable by a tool
that knows nothing about Postgres.

Two of the marts keep a version of every observation. The dataset carries the current version
only, because a reader wants the record of a game rather than the record of the scrapes that found
it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")


@dataclass(frozen=True, slots=True)
class Column:
    """One column of a published file, and the expression that produces it."""

    name: str
    expression: str | None = None

    def select(self) -> str:
        if not _IDENTIFIER.fullmatch(self.name):
            raise ValueError(f"invalid column name: {self.name!r}")
        return f"{self.expression or self.name} AS {self.name}"


@dataclass(frozen=True, slots=True)
class Mart:
    """One published file, and the mart it is read from."""

    name: str
    columns: tuple[Column, ...]
    order_by: tuple[str, ...]
    current_only: bool = False

    @property
    def file_name(self) -> str:
        return f"{self.name}.csv"

    @property
    def column_names(self) -> tuple[str, ...]:
        return tuple(column.name for column in self.columns)

    def query(self, marts_schema: str) -> str:
        """The statement that selects the published rows of this mart."""
        source = self._source(marts_schema)
        selected = ",\n            ".join(column.select() for column in self.columns)
        return (
            f"SELECT\n            {selected}\n"
            f"        FROM {source}\n"
            f"{self._filter()}"
            f"        ORDER BY {self._ordering()}"
        )

    def count_query(self, marts_schema: str) -> str:
        """The statement that counts the published rows of this mart."""
        return f"SELECT COUNT(*) FROM {self._source(marts_schema)}\n{self._filter()}".rstrip()

    def copy_statement(self, marts_schema: str) -> str:
        """The statement that streams the published rows out as CSV with a header."""
        return (
            f"COPY (\n        {self.query(marts_schema)}\n    ) "
            "TO STDOUT WITH (FORMAT csv, HEADER true)"
        )

    def _source(self, marts_schema: str) -> str:
        if not _IDENTIFIER.fullmatch(marts_schema):
            raise ValueError(f"invalid marts schema: {marts_schema!r}")
        if not _IDENTIFIER.fullmatch(self.name):
            raise ValueError(f"invalid mart name: {self.name!r}")
        return f"{marts_schema}.{self.name}"

    def _filter(self) -> str:
        return "        WHERE is_current\n" if self.current_only else ""

    def _ordering(self) -> str:
        if not self.order_by:
            raise ValueError(f"{self.name} needs an order to be published")
        for name in self.order_by:
            if not _IDENTIFIER.fullmatch(name):
                raise ValueError(f"invalid order column: {name!r}")
        return ", ".join(self.order_by)


# The published set. A file is added here and nowhere else.
MARTS: tuple[Mart, ...] = (
    Mart(
        name="dim_teams",
        columns=(
            Column("team_key", "team_key::text"),
            Column("season"),
            Column("source_id"),
            Column("name"),
            Column("mascot"),
            Column("city"),
            Column("state_code"),
            Column("county"),
            Column("division"),
            Column("region"),
            Column("primary_color_hex"),
            Column("secondary_color_hex"),
        ),
        order_by=("season", "team_key"),
        current_only=True,
    ),
    Mart(
        name="dim_dates",
        columns=(
            Column("date_key"),
            Column("date_day", "date_day::text"),
            Column("iso_year"),
            Column("iso_week"),
            Column("calendar_year"),
            Column("calendar_quarter"),
            Column("month_number"),
            Column("month_name"),
            Column("day_of_month"),
            Column("iso_day_of_week"),
            Column("day_name"),
            Column("is_weekend", "is_weekend::int"),
        ),
        order_by=("date_key",),
    ),
    Mart(
        name="fct_games",
        columns=(
            Column("game_key", "game_key::text"),
            Column("season"),
            Column("game_date_key"),
            Column("team_a_key", "team_a_key::text"),
            Column("team_b_key", "team_b_key::text"),
            Column("team_a_score"),
            Column("team_b_score"),
            Column("team_a_result"),
            Column("team_b_result"),
            Column("is_team_a_home", "is_team_a_home::int"),
            Column("is_team_b_home", "is_team_b_home::int"),
            Column("is_playoff_game", "is_playoff_game::int"),
            Column("notes"),
        ),
        order_by=("season", "game_date_key", "game_key"),
        current_only=True,
    ),
    Mart(
        name="fct_team_elo_ratings",
        columns=(
            Column("team_key", "team_key::text"),
            Column("season"),
            Column("as_of_date", "as_of_date::text"),
            Column("elo_rating"),
        ),
        order_by=("season", "as_of_date", "team_key"),
    ),
    Mart(
        name="fct_game_predictions",
        columns=(
            Column("game_key", "game_key::text"),
            Column("season"),
            Column("game_date", "game_date::text"),
            Column("team_a_key", "team_a_key::text"),
            Column("team_b_key", "team_b_key::text"),
            Column("team_a_rating"),
            Column("team_b_rating"),
            Column("team_a_win_probability"),
        ),
        order_by=("season", "game_date", "game_key"),
    ),
)


def export_marts(
    database_url: str,
    directory: str | Path,
    *,
    marts_schema: str = "ohfootball_marts",
    marts: Iterable[Mart] = MARTS,
) -> dict[str, int]:
    """Write one CSV file per mart into a directory and return the rows written.

    The rows are streamed out of the warehouse by COPY and written straight to the file, so a mart
    of any size costs one block of memory rather than one row of memory per row.
    """
    target = Path(directory)
    if not target.is_dir():
        raise ValueError(f"not a directory: {str(target)!r}")

    import psycopg

    counts: dict[str, int] = {}
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            for mart in marts:
                counts[mart.name] = _write_mart(cursor, mart, target, marts_schema)
    return counts


def _write_mart(cursor: Any, mart: Mart, directory: Path, marts_schema: str) -> int:
    path = directory / mart.file_name
    with path.open("wb") as sink:
        with cursor.copy(mart.copy_statement(marts_schema)) as copy:
            for block in copy:
                sink.write(block)
    # Counted rather than taken from the copy, because a text field may hold a line break and the
    # count of lines written is then not the count of rows written.
    row = cursor.execute(mart.count_query(marts_schema)).fetchone()
    return int(row[0])
