"""Postgres input adapter for the dbt game mart."""

from __future__ import annotations

import re

from .games import Game

_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")


def load_games(database_url: str, *, marts_schema: str = "ohfootball_marts") -> tuple[Game, ...]:
    """Load current canonical games and their current team names.

    The query does not remove games by result. The rule for which games change
    a rating lives on the Game record, so that one rule applies everywhere.
    """
    query = _build_query(marts_schema)

    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        rows = connection.execute(query).fetchall()

    return tuple(
        Game(
            game_key=row["game_key"],
            season=row["season"],
            game_date=row["game_date"],
            team_a_key=row["team_a_key"],
            team_a_program_id=row["team_a_program_id"],
            team_a_name=row["team_a_name"],
            team_a_division=row["team_a_division"],
            team_b_key=row["team_b_key"],
            team_b_program_id=row["team_b_program_id"],
            team_b_name=row["team_b_name"],
            team_b_division=row["team_b_division"],
            team_a_result=row["team_a_result"],
            is_team_a_home=row["is_team_a_home"],
            is_team_b_home=row["is_team_b_home"],
            team_a_score=row["team_a_score"],
            team_b_score=row["team_b_score"],
            notes=row["notes"],
            is_playoff_game=row["is_playoff_game"],
        )
        for row in rows
    )


def _build_query(marts_schema: str) -> str:
    if not _IDENTIFIER.fullmatch(marts_schema):
        raise ValueError(f"invalid marts schema: {marts_schema!r}")

    return f"""
        SELECT
            game.game_key::text AS game_key,
            game.season,
            dates.date_day AS game_date,
            game.team_a_key::text AS team_a_key,
            team_a.source_id AS team_a_program_id,
            team_a.name AS team_a_name,
            team_a.division AS team_a_division,
            game.team_b_key::text AS team_b_key,
            team_b.source_id AS team_b_program_id,
            team_b.name AS team_b_name,
            team_b.division AS team_b_division,
            game.team_a_result,
            game.is_team_a_home,
            game.is_team_b_home,
            game.team_a_score,
            game.team_b_score,
            game.notes,
            game.is_playoff_game
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
          AND team_a.state_code = 'OH'
          AND team_b.state_code = 'OH'
        ORDER BY game.season, dates.date_day, game.game_key
    """
