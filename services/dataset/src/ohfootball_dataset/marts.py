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
    description: str = ""

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
    description: str = ""

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
#
# The descriptions are the text that Kaggle shows for each file and each column. They are kept
# next to the columns, so a column cannot be published without one.
MARTS: tuple[Mart, ...] = (
    Mart(
        name="dim_teams",
        description=(
            "One row per team per season, with the name, place, division, region, and colors of "
            "the team. A team from another state is here too, with its own state_code."
        ),
        columns=(
            Column(
                "team_key",
                "team_key::text",
                "The key of the team in one season, as a UUID. A school has a different key in "
                "each season. The other files refer to a team by this key.",
            ),
            Column("season", description="The year of the season, for example 2025."),
            Column(
                "source_id",
                description=(
                    "The identifier that joeeitel.com gives the school. It is the same in every "
                    "season, so it links the seasons of one school. A school that closed before "
                    "that site began has an identifier that starts with ohhsfbdb:."
                ),
            ),
            Column("name", description="The name of the school."),
            Column(
                "mascot",
                description="The nickname of the team. Empty when the source does not state it.",
            ),
            Column(
                "city",
                description="The city of the school. Empty when the source does not state it.",
            ),
            Column(
                "state_code",
                description=(
                    "The two-letter postal code of the state or province of the school, OH for "
                    "Ohio. Empty when the source does not state it."
                ),
            ),
            Column(
                "county",
                description="The county of the school. Empty when the source does not state it.",
            ),
            Column(
                "division",
                description=(
                    "The OHSAA division of the team in that season, as a whole number. Division 1 "
                    "holds the largest schools. Empty when the source does not state it."
                ),
            ),
            Column(
                "region",
                description=(
                    "The OHSAA playoff region of the team in that season, as a whole number. "
                    "Empty when the source does not state it."
                ),
            ),
            Column(
                "primary_color_hex",
                description=(
                    "The first color of the school, as a hexadecimal color code. Empty when the "
                    "source does not state it."
                ),
            ),
            Column(
                "secondary_color_hex",
                description=(
                    "The second color of the school, as a hexadecimal color code. Empty when the "
                    "source does not state it."
                ),
            ),
        ),
        order_by=("season", "team_key"),
        current_only=True,
    ),
    Mart(
        name="dim_dates",
        description=(
            "One row per day, from the date of the first game in the record to the date of the "
            "last. fct_games refers to a day by date_key."
        ),
        columns=(
            Column(
                "date_key",
                description="The date as a whole number, YYYYMMDD, for example 20250829.",
            ),
            Column("date_day", "date_day::text", "The date, as YYYY-MM-DD."),
            Column(
                "iso_year",
                description=(
                    "The ISO 8601 year of the date. In the first and last days of a year it can "
                    "differ from calendar_year."
                ),
            ),
            Column("iso_week", description="The ISO 8601 week of the year, from 1 to 53."),
            Column("calendar_year", description="The calendar year of the date."),
            Column("calendar_quarter", description="The quarter of the year, from 1 to 4."),
            Column("month_number", description="The month of the year, from 1 to 12."),
            Column("month_name", description="The English name of the month, for example August."),
            Column("day_of_month", description="The day of the month, from 1 to 31."),
            Column(
                "iso_day_of_week",
                description="The ISO 8601 day of the week, from 1 for Monday to 7 for Sunday.",
            ),
            Column("day_name", description="The English name of the day, for example Friday."),
            Column(
                "is_weekend",
                "is_weekend::int",
                "1 when the date is a Saturday or a Sunday, and 0 when it is not.",
            ),
        ),
        order_by=("date_key",),
    ),
    Mart(
        name="fct_games",
        description=(
            "One row per game, with both scores, both results, and the home side. A game is here "
            "one time, not one time for each team."
        ),
        columns=(
            Column(
                "game_key",
                "game_key::text",
                "The key of the game, as a UUID. It is made from the season, the date, and the two "
                "teams.",
            ),
            Column("season", description="The year of the season, for example 2025."),
            Column(
                "game_date_key",
                description="The date of the game, as YYYYMMDD. It matches date_key in dim_dates.",
            ),
            Column(
                "team_a_key",
                "team_a_key::text",
                "The team_key of team A. Team A is the team whose source_id sorts first. It is not "
                "always the home team or the winner.",
            ),
            Column(
                "team_b_key",
                "team_b_key::text",
                "The team_key of team B, the other team in the game.",
            ),
            Column(
                "team_a_score",
                description=(
                    "The points of team A. Empty for a canceled game, a forfeit, or a game with "
                    "no score in the source."
                ),
            ),
            Column(
                "team_b_score",
                description=(
                    "The points of team B. Empty for a canceled game, a forfeit, or a game with "
                    "no score in the source."
                ),
            ),
            Column(
                "team_a_result",
                description=(
                    "The result for team A. W is a win, L is a loss, T is a tie, and C is a "
                    "canceled game. unknown means the source does not state the result."
                ),
            ),
            Column(
                "team_b_result",
                description=(
                    "The result for team B, with the same codes as team_a_result. After a double "
                    "forfeit both teams have L."
                ),
            ),
            Column(
                "is_team_a_home",
                "is_team_a_home::int",
                "1 when team A played at home, and 0 when it did not. A game on neither ground "
                "has 0 for both teams.",
            ),
            Column(
                "is_team_b_home",
                "is_team_b_home::int",
                "1 when team B played at home, and 0 when it did not. A game on neither ground "
                "has 0 for both teams.",
            ),
            Column(
                "is_playoff_game",
                "is_playoff_game::int",
                "1 for an OHSAA playoff game, and 0 for a regular season game.",
            ),
            Column(
                "notes",
                description=(
                    "A note from the source in lower case, for example overtime, forfeit, double "
                    "forfeit, or canceled. Empty for most games."
                ),
            ),
        ),
        order_by=("season", "game_date_key", "game_key"),
        current_only=True,
    ),
    Mart(
        name="fct_team_elo_ratings",
        description=(
            "The Elo rating of each Ohio team, taken on a date in each season. A rating counts "
            "the games before that date and no game on it."
        ),
        columns=(
            Column(
                "team_key",
                "team_key::text",
                "The team_key of the team. It matches team_key in dim_teams.",
            ),
            Column("season", description="The year of the season, for example 2025."),
            Column(
                "as_of_date",
                "as_of_date::text",
                "The date the rating was taken, as YYYY-MM-DD. The rating counts the games before "
                "this date and no game on it.",
            ),
            Column(
                "elo_rating",
                description="The Elo rating of the team. A higher rating is a stronger team.",
            ),
        ),
        order_by=("season", "as_of_date", "team_key"),
    ),
    Mart(
        name="fct_game_predictions",
        description=(
            "One prediction for each completed game between two Ohio teams. It holds the rating "
            "each team carried into the game and the win probability read from those ratings."
        ),
        columns=(
            Column(
                "game_key",
                "game_key::text",
                "The game_key of the game. It matches game_key in fct_games.",
            ),
            Column("season", description="The year of the season, for example 2025."),
            Column("game_date", "game_date::text", "The date of the game, as YYYY-MM-DD."),
            Column(
                "team_a_key",
                "team_a_key::text",
                "The team_key of team A. It is the same team A as in fct_games.",
            ),
            Column(
                "team_b_key",
                "team_b_key::text",
                "The team_key of team B. It is the same team B as in fct_games.",
            ),
            Column("team_a_rating", description="The Elo rating team A carried into the game."),
            Column("team_b_rating", description="The Elo rating team B carried into the game."),
            Column(
                "team_a_win_probability",
                description=(
                    "The probability that team A wins, from 0 to 1, calculated before the game. "
                    "The rating model can add an advantage for the home team, so this can differ "
                    "from a probability read from the two ratings alone."
                ),
            ),
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
