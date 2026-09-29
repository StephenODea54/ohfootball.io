"""Input adapters for the game mart: the warehouse and the public dataset export."""

from __future__ import annotations

import csv
import re
from datetime import date
from pathlib import Path

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


def load_games_from_export(directory: Path | str) -> tuple[Game, ...]:
    """Load games from the files that the dataset export writes.

    The export holds dim_teams.csv and fct_games.csv with the current rows only. Keys and dates
    are text, flags are 0 or 1 and an empty cell is a missing value. The same rule as the
    warehouse query applies: both teams must be Ohio teams, and a game whose team is not in
    dim_teams.csv is left out.
    """
    folder = Path(directory)
    teams: dict[str, dict[str, str]] = {}
    with (folder / "dim_teams.csv").open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            teams[row["team_key"]] = row
    games: list[Game] = []
    with (folder / "fct_games.csv").open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            team_a = teams.get(row["team_a_key"])
            team_b = teams.get(row["team_b_key"])
            if team_a is None or team_b is None:
                continue
            if team_a["state_code"] != "OH" or team_b["state_code"] != "OH":
                continue
            day = row["game_date_key"]
            games.append(
                Game(
                    game_key=row["game_key"],
                    season=int(row["season"]),
                    game_date=date(int(day[:4]), int(day[4:6]), int(day[6:])),
                    team_a_key=row["team_a_key"],
                    team_a_program_id=team_a["source_id"] or None,
                    team_a_name=team_a["name"],
                    team_a_division=_whole_number(team_a["division"]),
                    team_b_key=row["team_b_key"],
                    team_b_program_id=team_b["source_id"] or None,
                    team_b_name=team_b["name"],
                    team_b_division=_whole_number(team_b["division"]),
                    team_a_result=row["team_a_result"],
                    is_team_a_home=row["is_team_a_home"] == "1",
                    is_team_b_home=row["is_team_b_home"] == "1",
                    team_a_score=_whole_number(row["team_a_score"]),
                    team_b_score=_whole_number(row["team_b_score"]),
                    notes=row["notes"] or None,
                    is_playoff_game=row["is_playoff_game"] == "1",
                )
            )
    return tuple(sorted(games, key=lambda game: (game.season, game.game_date, game.game_key)))


def _whole_number(value: str) -> int | None:
    return int(value) if value else None
