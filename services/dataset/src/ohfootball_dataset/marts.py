"""The marts the public dataset carries, and how each one becomes a CSV file.

Every column is named here rather than taken with a star, so the shape of the published dataset is
read from this file alone. The casts match the ones the API snapshot uses: a key and a date leave
the warehouse as text, and a flag leaves it as 0 or 1. That keeps a CSV column readable by a tool
that knows nothing about Postgres.

Two of the marts keep a version of every observation. The dataset carries the current version
only, because a reader wants the record of a game rather than the record of the scrapes that found
it.

Each column also names its type on Kaggle. The metadata sends the type of each column with its
description.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")


@dataclass(frozen=True, slots=True)
class Column:
    """One column of a published file, and the expression that produces it."""

    name: str
    expression: str | None = None
    description: str = ""
    kaggle_type: str = ""

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
# next to the columns, with the type of each column on Kaggle, so a column cannot be published
# without both. A key and a date are "string", because they are written as text. A flag is
# "boolean", because it holds only 0 and 1.
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
                kaggle_type="string",
            ),
            Column(
                "season",
                description="The year of the season, for example 2025.",
                kaggle_type="numeric",
            ),
            Column(
                "source_id",
                description=(
                    "The identifier that joeeitel.com gives the school. It is the same in every "
                    "season, so it links the seasons of one school. A school that closed before "
                    "that site began has an identifier that starts with ohhsfbdb:."
                ),
                kaggle_type="string",
            ),
            Column("name", description="The name of the school.", kaggle_type="string"),
            Column(
                "mascot",
                description="The nickname of the team. Empty when the source does not state it.",
                kaggle_type="string",
            ),
            Column(
                "city",
                description="The city of the school. Empty when the source does not state it.",
                kaggle_type="string",
            ),
            Column(
                "state_code",
                description=(
                    "The two-letter postal code of the state or province of the school, OH for "
                    "Ohio. Empty when the source does not state it."
                ),
                kaggle_type="string",
            ),
            Column(
                "county",
                description="The county of the school. Empty when the source does not state it.",
                kaggle_type="string",
            ),
            Column(
                "division",
                description=(
                    "The OHSAA division of the team in that season, as a whole number. Division 1 "
                    "holds the largest schools. Empty when the source does not state it."
                ),
                kaggle_type="numeric",
            ),
            Column(
                "region",
                description=(
                    "The OHSAA playoff region of the team in that season, as a whole number. "
                    "Empty when the source does not state it."
                ),
                kaggle_type="numeric",
            ),
            Column(
                "primary_color_hex",
                description=(
                    "The first color of the school, as a hexadecimal color code. Empty when the "
                    "source does not state it."
                ),
                kaggle_type="string",
            ),
            Column(
                "secondary_color_hex",
                description=(
                    "The second color of the school, as a hexadecimal color code. Empty when the "
                    "source does not state it."
                ),
                kaggle_type="string",
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
                kaggle_type="numeric",
            ),
            Column("date_day", "date_day::text", "The date, as YYYY-MM-DD.", kaggle_type="string"),
            Column(
                "iso_year",
                description=(
                    "The ISO 8601 year of the date. In the first and last days of a year it can "
                    "differ from calendar_year."
                ),
                kaggle_type="numeric",
            ),
            Column(
                "iso_week",
                description="The ISO 8601 week of the year, from 1 to 53.",
                kaggle_type="numeric",
            ),
            Column(
                "calendar_year",
                description="The calendar year of the date.",
                kaggle_type="numeric",
            ),
            Column(
                "calendar_quarter",
                description="The quarter of the year, from 1 to 4.",
                kaggle_type="numeric",
            ),
            Column(
                "month_number",
                description="The month of the year, from 1 to 12.",
                kaggle_type="numeric",
            ),
            Column(
                "month_name",
                description="The English name of the month, for example August.",
                kaggle_type="string",
            ),
            Column(
                "day_of_month",
                description="The day of the month, from 1 to 31.",
                kaggle_type="numeric",
            ),
            Column(
                "iso_day_of_week",
                description="The ISO 8601 day of the week, from 1 for Monday to 7 for Sunday.",
                kaggle_type="numeric",
            ),
            Column(
                "day_name",
                description="The English name of the day, for example Friday.",
                kaggle_type="string",
            ),
            Column(
                "is_weekend",
                "is_weekend::int",
                "1 when the date is a Saturday or a Sunday, and 0 when it is not.",
                kaggle_type="boolean",
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
                kaggle_type="string",
            ),
            Column(
                "season",
                description="The year of the season, for example 2025.",
                kaggle_type="numeric",
            ),
            Column(
                "game_date_key",
                description="The date of the game, as YYYYMMDD. It matches date_key in dim_dates.",
                kaggle_type="numeric",
            ),
            Column(
                "team_a_key",
                "team_a_key::text",
                "The team_key of team A. Team A is the team whose source_id sorts first. It is not "
                "always the home team or the winner.",
                kaggle_type="string",
            ),
            Column(
                "team_b_key",
                "team_b_key::text",
                "The team_key of team B, the other team in the game.",
                kaggle_type="string",
            ),
            Column(
                "team_a_score",
                description=(
                    "The points of team A. Empty for a canceled game, a forfeit, or a game with "
                    "no score in the source."
                ),
                kaggle_type="numeric",
            ),
            Column(
                "team_b_score",
                description=(
                    "The points of team B. Empty for a canceled game, a forfeit, or a game with "
                    "no score in the source."
                ),
                kaggle_type="numeric",
            ),
            Column(
                "team_a_result",
                description=(
                    "The result for team A. W is a win, L is a loss, T is a tie, and C is a "
                    "canceled game. unknown means the source does not state the result."
                ),
                kaggle_type="string",
            ),
            Column(
                "team_b_result",
                description=(
                    "The result for team B, with the same codes as team_a_result. After a double "
                    "forfeit both teams have L."
                ),
                kaggle_type="string",
            ),
            Column(
                "is_team_a_home",
                "is_team_a_home::int",
                "1 when team A played at home, and 0 when it did not. A game on neither ground "
                "has 0 for both teams.",
                kaggle_type="boolean",
            ),
            Column(
                "is_team_b_home",
                "is_team_b_home::int",
                "1 when team B played at home, and 0 when it did not. A game on neither ground "
                "has 0 for both teams.",
                kaggle_type="boolean",
            ),
            Column(
                "is_playoff_game",
                "is_playoff_game::int",
                "1 for an OHSAA playoff game, and 0 for a regular season game.",
                kaggle_type="boolean",
            ),
            Column(
                "notes",
                description=(
                    "A note from the source in lower case, for example overtime, forfeit, double "
                    "forfeit, or canceled. Empty for most games."
                ),
                kaggle_type="string",
            ),
        ),
        order_by=("season", "game_date_key", "game_key"),
        current_only=True,
    ),
    Mart(
        name="fct_team_ratings",
        description=(
            "The rating of each Ohio team, taken on a date in each season. A rating is a number "
            "of points, and the gap between two ratings is the margin that the model expects on "
            "a neutral field. A rating counts the games before that date and no game on it."
        ),
        columns=(
            Column(
                "team_key",
                "team_key::text",
                "The team_key of the team. It matches team_key in dim_teams.",
                kaggle_type="string",
            ),
            Column(
                "season",
                description="The year of the season, for example 2025.",
                kaggle_type="numeric",
            ),
            Column(
                "as_of_date",
                "as_of_date::text",
                "The date the rating was taken, as YYYY-MM-DD. The rating counts the games before "
                "this date and no game on it.",
                kaggle_type="string",
            ),
            Column(
                "rating",
                description=(
                    "The rating of the team, in points. A higher rating is a stronger team. The "
                    "value 0 has no meaning of its own, so compare two ratings of one date."
                ),
                kaggle_type="numeric",
            ),
            Column(
                "relative_rating",
                description=(
                    "The rating minus the median rating of the Ohio teams on the same date, so "
                    "that 0 is the median team. A positive value is the number of points by which "
                    "the team would be expected to beat the median team on a neutral field."
                ),
                kaggle_type="numeric",
            ),
        ),
        order_by=("season", "as_of_date", "team_key"),
    ),
    Mart(
        name="fct_game_predictions",
        description=(
            "One prediction for each game of an Ohio team: each game played before the date of "
            "the data, and each game of the season in progress not yet played. A game against a "
            "team from another state that was played without both scores has no prediction. Each "
            "row holds the rating each team carried into the game, the margin that the model "
            "expected and the win probability read from that margin. In a game against a team "
            "from another state, that team's rating comes only from its games against Ohio teams, "
            "and the team is not in fct_team_ratings."
        ),
        columns=(
            Column(
                "game_key",
                "game_key::text",
                "The game_key of the game. It matches game_key in fct_games.",
                kaggle_type="string",
            ),
            Column(
                "season",
                description="The year of the season, for example 2025.",
                kaggle_type="numeric",
            ),
            Column(
                "game_date",
                "game_date::text",
                "The date of the game, as YYYY-MM-DD.",
                kaggle_type="string",
            ),
            Column(
                "team_a_key",
                "team_a_key::text",
                "The team_key of team A. It is the same team A as in fct_games.",
                kaggle_type="string",
            ),
            Column(
                "team_b_key",
                "team_b_key::text",
                "The team_key of team B. It is the same team B as in fct_games.",
                kaggle_type="string",
            ),
            Column(
                "team_a_rating",
                description="The rating team A carried into the game, in points.",
                kaggle_type="numeric",
            ),
            Column(
                "team_b_rating",
                description="The rating team B carried into the game, in points.",
                kaggle_type="numeric",
            ),
            Column(
                "team_a_win_probability",
                description=(
                    "The probability that team A wins, from 0 to 1, calculated before the game "
                    "from the expected margin."
                ),
                kaggle_type="numeric",
            ),
            Column(
                "predicted_margin",
                description=(
                    "The margin that the model expected, team A points minus team B points. It "
                    "includes the edge of the home team, so it can differ from the gap between "
                    "the two ratings."
                ),
                kaggle_type="numeric",
            ),
            Column(
                "as_of_date",
                "as_of_date::text",
                "The date of the prediction, as YYYY-MM-DD. It is the date of the game for a game "
                "played before the date of the data, and the date of the data for a game not yet "
                "played.",
                kaggle_type="string",
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
