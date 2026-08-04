"""Postgres input adapter for the dbt game mart."""

from __future__ import annotations

import re
from typing import Any

from .elo import Game

_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")


def load_games(database_url: str, *, marts_schema: str = "ohfootball_marts") -> tuple[Game, ...]:
    """Load current canonical games and their current team names."""
    if not _IDENTIFIER.fullmatch(marts_schema):
        raise ValueError(f"invalid marts schema: {marts_schema!r}")

    import psycopg
    from psycopg.rows import dict_row

    query = f"""
        SELECT
            game.game_key::text AS game_key,
            game.season,
            dates.date_day AS game_date,
            game.team_a_key::text AS team_a_key,
            team_a.name AS team_a_name,
            game.team_b_key::text AS team_b_key,
            team_b.name AS team_b_name,
            game.team_a_result
        FROM {marts_schema}.fct_games AS game
        INNER JOIN {marts_schema}.dim_dates AS dates
            ON dates.date_key = game.game_date_key
        INNER JOIN {marts_schema}.dim_teams AS team_a
            ON team_a.team_key = game.team_a_key
           AND team_a.is_current
        INNER JOIN {marts_schema}.dim_teams AS team_b
            ON team_b.team_key = game.team_b_key
           AND team_b.is_current
        WHERE game.is_current
          AND game.team_a_result IN ('W', 'L', 'unknown')
        ORDER BY game.season, dates.date_day, game.game_key
    """

    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        rows: list[dict[str, Any]] = connection.execute(query).fetchall()

    return tuple(
        Game(
            game_key=row["game_key"],
            season=row["season"],
            game_date=row["game_date"],
            team_a_key=row["team_a_key"],
            team_a_name=row["team_a_name"],
            team_b_key=row["team_b_key"],
            team_b_name=row["team_b_name"],
            team_a_result=row["team_a_result"],
        )
        for row in rows
    )
