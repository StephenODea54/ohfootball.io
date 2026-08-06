"""Production persistence for Elo rating snapshots."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import date
from typing import Iterable

_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")


@dataclass(frozen=True, slots=True)
class TeamSeason:
    season: int
    team_key: str
    program_id: str
    division: int | None


@dataclass(frozen=True, slots=True)
class RatingSnapshot:
    team_key: str
    season: int
    as_of_date: date
    rating: float


def load_team_seasons(
    database_url: str,
    *,
    season: int,
    marts_schema: str = "ohfootball_marts",
) -> tuple[TeamSeason, ...]:
    """Load every current Ohio team in a season, including teams with no games."""
    if not _IDENTIFIER.fullmatch(marts_schema):
        raise ValueError(f"invalid marts schema: {marts_schema!r}")

    import psycopg
    from psycopg.rows import dict_row

    query = f"""
        SELECT
            season,
            team_key::text AS team_key,
            source_id AS program_id,
            division
        FROM {marts_schema}.dim_teams
        WHERE is_current
          AND state_code = 'OH'
          AND season = %s
        ORDER BY team_key
    """
    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        rows = connection.execute(query, (season,)).fetchall()

    return tuple(
        TeamSeason(
            season=row["season"],
            team_key=row["team_key"],
            program_id=row["program_id"],
            division=row["division"],
        )
        for row in rows
    )


def publish_ratings(
    database_url: str,
    snapshots: Iterable[RatingSnapshot],
    *,
    marts_schema: str = "ohfootball_marts",
) -> int:
    """Atomically replace one season/date snapshot and return its row count."""
    if not _IDENTIFIER.fullmatch(marts_schema):
        raise ValueError(f"invalid marts schema: {marts_schema!r}")

    rows = tuple(snapshots)
    if not rows:
        raise ValueError("at least one rating snapshot is required")
    seasons = {row.season for row in rows}
    as_of_dates = {row.as_of_date for row in rows}
    team_keys = {row.team_key for row in rows}
    if len(seasons) != 1 or len(as_of_dates) != 1:
        raise ValueError("a publication must contain one season and as-of date")
    if len(team_keys) != len(rows):
        raise ValueError("a publication cannot contain duplicate teams")
    if any(not math.isfinite(row.rating) or row.rating <= 0 for row in rows):
        raise ValueError("ratings must be finite and greater than zero")

    import psycopg

    season = next(iter(seasons))
    as_of_date = next(iter(as_of_dates))
    target = f"{marts_schema}.fct_team_elo_ratings"
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TEMP TABLE pending_team_elo_ratings (
                    team_key UUID NOT NULL,
                    season SMALLINT NOT NULL,
                    as_of_date DATE NOT NULL,
                    elo_rating DOUBLE PRECISION NOT NULL
                ) ON COMMIT DROP
                """
            )
            with cursor.copy(
                """
                COPY pending_team_elo_ratings (
                    team_key,
                    season,
                    as_of_date,
                    elo_rating
                ) FROM STDIN
                """
            ) as copy:
                for row in rows:
                    copy.write_row(
                        (row.team_key, row.season, row.as_of_date, row.rating)
                    )

            cursor.execute(
                f"DELETE FROM {target} WHERE season = %s AND as_of_date = %s",
                (season, as_of_date),
            )
            cursor.execute(
                f"""
                INSERT INTO {target} (
                    team_key,
                    season,
                    as_of_date,
                    elo_rating
                )
                SELECT
                    team_key,
                    season,
                    as_of_date,
                    elo_rating
                FROM pending_team_elo_ratings
                """
            )
    return len(rows)
