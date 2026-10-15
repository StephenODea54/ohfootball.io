"""Load the teams and the games that the computer points of a season read."""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from .harbin import HarbinGame, HarbinTeam, first_wednesday, week_of
from .out_of_state import OHIO

_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")
# Week one is the first week with this many games between two Ohio teams. The API counts weeks
# the same way.
WEEK_ONE_GAMES = 50


@dataclass(frozen=True, slots=True)
class HarbinInputs:
    teams: dict[str, HarbinTeam]
    games: tuple[HarbinGame, ...]
    # The teams from other states whose page the newest scrape read, so their whole schedule is
    # known.
    complete_schedules: frozenset[str]
    names: dict[str, str]


def load_harbin_inputs(
    database_url: str, *, season: int, marts_schema: str = "ohfootball_marts"
) -> HarbinInputs:
    """Load the teams of a season and the games of fct_harbin_games."""
    if not _IDENTIFIER.fullmatch(marts_schema):
        raise ValueError(f"invalid marts schema: {marts_schema!r}")

    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        teams = connection.execute(
            f"""
            SELECT team_key::text AS team_key, name, state_code, division, region
            FROM {marts_schema}.dim_teams
            WHERE is_current AND season = %s
            """,
            (season,),
        ).fetchall()
        games = connection.execute(
            f"""
            SELECT
                game_key::text AS game_key,
                game_date,
                team_a_key::text AS team_a_key,
                team_b_key::text AS team_b_key,
                team_a_result,
                team_b_result,
                counts_in_ohsaa_rating,
                is_playoff_game,
                has_team_a_schedule,
                has_team_b_schedule
            FROM {marts_schema}.fct_harbin_games
            WHERE season = %s
            ORDER BY game_date, game_key
            """,
            (season,),
        ).fetchall()
    return harbin_inputs(teams, games)


def harbin_inputs(
    team_rows: Iterable[Mapping[str, Any]], game_rows: Iterable[Mapping[str, Any]]
) -> HarbinInputs:
    """Build the inputs from the rows of the two queries.

    A team on the schedule of an opponent from another state may have no row in dim_teams. It
    is a team from another state without a division, so a win over it gives no points.
    """
    teams: dict[str, HarbinTeam] = {}
    names: dict[str, str] = {}
    for row in team_rows:
        is_ohio = row["state_code"] == OHIO
        teams[row["team_key"]] = HarbinTeam(
            team_key=row["team_key"],
            is_ohio=is_ohio,
            division=row["division"],
            region=row["region"] if is_ohio else None,
        )
        names[row["team_key"]] = row["name"]
    games: list[HarbinGame] = []
    complete: set[str] = set()
    for row in game_rows:
        for side in ("a", "b"):
            key = row[f"team_{side}_key"]
            if key not in teams:
                teams[key] = HarbinTeam(team_key=key, is_ohio=False, division=None)
            if row[f"has_team_{side}_schedule"] and not teams[key].is_ohio:
                complete.add(key)
        games.append(
            HarbinGame(
                game_key=row["game_key"],
                game_date=row["game_date"],
                team_a_key=row["team_a_key"],
                team_b_key=row["team_b_key"],
                team_a_result=row["team_a_result"],
                team_b_result=row.get("team_b_result"),
                counts=row["counts_in_ohsaa_rating"],
                is_playoff_game=row["is_playoff_game"],
            )
        )
    return HarbinInputs(
        teams=teams, games=tuple(games), complete_schedules=frozenset(complete), names=names
    )


def season_start(games: Iterable[HarbinGame], teams: Mapping[str, HarbinTeam]) -> date | None:
    """Give the Wednesday that starts week one: the first week with enough Ohio games."""
    counts: dict[date, int] = {}
    for game in games:
        if teams[game.team_a_key].is_ohio and teams[game.team_b_key].is_ohio:
            start = first_wednesday(game.game_date)
            counts[start] = counts.get(start, 0) + 1
    for start in sorted(counts):
        if counts[start] >= WEEK_ONE_GAMES:
            return start
    return None


def completed_week(as_of_date: date, first_day: date, *, last_week: int) -> int:
    """Give the last week whose games are over on a date.

    A week runs from Wednesday to Tuesday, and its games end on Saturday. From Sunday to Tuesday
    the week of the date is over. From Wednesday to Saturday only the week before it is.
    """
    week = week_of(as_of_date, first_day)
    if as_of_date.weekday() not in (6, 0, 1):
        week -= 1
    return max(0, min(week, last_week))


def last_regular_season_day(first_day: date, weeks: int) -> date:
    """Give the Saturday of the last week of the regular season."""
    return first_day + timedelta(days=7 * (weeks - 1) + 3)
