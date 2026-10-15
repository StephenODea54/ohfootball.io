"""Turn a playoff projection into table rows and replace one projection in the warehouse."""

from __future__ import annotations

import math
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date

from .harbin import HarbinLine, PlayoffFormat
from .projection import OwnGames, TeamOutlook
from .simulation import SeasonSetup

_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")


@dataclass(frozen=True)
class ProjectionRows:
    season: int
    as_of_date: date
    runs: int
    seed: int
    playoff_format: PlayoffFormat
    outlooks: list[tuple] = field(default_factory=list)
    records: list[tuple] = field(default_factory=list)


def projection_rows(
    *,
    setup: SeasonSetup,
    own: OwnGames,
    runs: int,
    outlooks: Sequence[TeamOutlook],
    standings: Mapping[str, HarbinLine],
    as_of_date: date,
    seed: int,
) -> ProjectionRows:
    """Build the rows of the tables of one projection."""
    season = setup.season
    rows = ProjectionRows(
        season=season,
        as_of_date=as_of_date,
        runs=runs,
        seed=seed,
        playoff_format=setup.playoff_format,
    )
    position = {key: number for number, key in enumerate(setup.team_keys)}
    for outlook in outlooks:
        team = position[outlook.team_key]
        line = standings[outlook.team_key]
        columns = own.columns[team][own.columns[team] >= 0]
        games = [setup.remaining[column] for column in columns]
        rows.outlooks.append(
            (
                outlook.team_key,
                season,
                as_of_date,
                outlook.region,
                line.wins,
                line.losses,
                line.ties,
                line.level_one,
                line.level_two,
                line.divisor,
                line.average,
                outlook.qualify,
                outlook.home,
                outlook.bye,
                outlook.region_win,
                outlook.expected_seed,
                [setup.game_keys[game] for game in games],
                [game.qualify_if_win for game in outlook.games],
                [game.qualify_if_loss for game in outlook.games],
                [game.home_if_win for game in outlook.games],
                [game.home_if_loss for game in outlook.games],
            )
        )
        for record in outlook.records:
            rows.records.append(
                (
                    outlook.team_key,
                    season,
                    as_of_date,
                    record.wins,
                    record.losses,
                    record.probability,
                    record.runs,
                    record.low_average,
                    record.median_average,
                    record.high_average,
                    record.qualify,
                    record.home,
                    record.bye,
                )
            )
    return rows


_TABLES = {
    "outlooks": (
        "fct_playoff_outlooks",
        "team_key, season, as_of_date, region, wins, losses, ties, level_one, level_two, "
        "divisor, average, qualify_probability, home_probability, bye_probability, "
        "region_win_probability, expected_seed, remaining_game_keys, qualify_if_win, "
        "qualify_if_loss, home_if_win, home_if_loss",
    ),
    "records": (
        "fct_playoff_record_odds",
        "team_key, season, as_of_date, wins, losses, probability, runs, low_average, "
        "median_average, high_average, qualify_probability, home_probability, bye_probability",
    ),
}


def check_rows(rows: ProjectionRows) -> None:
    """Refuse a projection that the tables must not hold."""
    if not rows.outlooks:
        raise ValueError("a projection needs at least one team")
    keys = [row[0] for row in rows.outlooks]
    if len(set(keys)) != len(keys):
        raise ValueError("a projection cannot hold a team twice")
    for row in rows.outlooks:
        if any(not 0.0 <= value <= 1.0 for value in row[11:15]):
            raise ValueError("probabilities must fall between zero and one")
        if any(not math.isfinite(value) for value in (*row[7:9], row[10], row[15])):
            raise ValueError("points, averages and seeds must be finite")


def publish_projection(
    database_url: str, rows: ProjectionRows, *, marts_schema: str = "ohfootball_marts"
) -> int:
    """Replace the projection of one season and as-of date, in one transaction."""
    if not _IDENTIFIER.fullmatch(marts_schema):
        raise ValueError(f"invalid marts schema: {marts_schema!r}")
    check_rows(rows)

    import psycopg

    fmt = rows.playoff_format
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            for table, _ in (*_TABLES.values(), ("dim_playoff_projections", "")):
                cursor.execute(
                    f"DELETE FROM {marts_schema}.{table} WHERE season = %s AND as_of_date = %s",
                    (rows.season, rows.as_of_date),
                )
            cursor.execute(
                f"""
                INSERT INTO {marts_schema}.dim_playoff_projections
                    (season, as_of_date, runs, seed, qualifiers, byes, home_games)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    rows.season,
                    rows.as_of_date,
                    rows.runs,
                    rows.seed,
                    fmt.qualifiers,
                    fmt.byes,
                    fmt.home_games,
                ),
            )
            for name, (table, columns) in _TABLES.items():
                with cursor.copy(f"COPY {marts_schema}.{table} ({columns}) FROM STDIN") as copy:
                    for row in getattr(rows, name):
                        copy.write_row(row)
    return len(rows.outlooks)
