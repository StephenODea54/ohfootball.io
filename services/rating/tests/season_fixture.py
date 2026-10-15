"""A small league with one past season and one season in progress, for the simulation tests."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from random import Random

from ohfootball_rating.games import Game
from ohfootball_rating.harbin import HarbinTeam, counted_games, playoff_format
from ohfootball_rating.margin import MarginBacktestResult, backtest
from ohfootball_rating.simulation import SeasonSetup, build_setup, season_games

SEASON = 2026
WEEK_ONE = date(2026, 8, 19)
LAST_DAY = date(2026, 10, 24)
OHIO = [f"T{number}" for number in range(8)]
OTHER = "X"


def friday(season: int, week: int) -> date:
    start = WEEK_ONE if season == SEASON else WEEK_ONE - timedelta(days=364)
    return start + timedelta(days=7 * (week - 1) + 2)


@dataclass
class League:
    teams: dict[str, HarbinTeam]
    games: list[Game]
    result: MarginBacktestResult

    def setup(self, **extra) -> SeasonSetup:
        season = [game for game in self.games if game.season == SEASON]
        counted = counted_games(season_games(season), self.teams, last_day=LAST_DAY)
        return build_setup(
            season=SEASON,
            teams=self.teams,
            harbin_games=counted,
            games={game.game_key: game for game in season},
            result=self.result,
            playoff_format=playoff_format(SEASON),
            **extra,
        )


def make_league(*, played_weeks: int = 5, seed: int = 7) -> League:
    """Build eight Ohio teams in two regions and one team from another state.

    Every Ohio team plays ten games: nine against the other Ohio teams over two seasons of a
    rotation, and one against the other team in a week of its own. The past season gives the
    errors of the model.
    """
    rng = Random(seed)
    strength = {key: rng.uniform(-20, 20) for key in OHIO + [OTHER]}
    division = {key: 1 + number % 3 for number, key in enumerate(OHIO)}
    teams = {
        key: HarbinTeam(key, True, division[key], 1 + number // 4)
        for number, key in enumerate(OHIO)
    }
    teams[OTHER] = HarbinTeam(OTHER, False, 2, None)
    games: list[Game] = []
    for season in (SEASON - 1, SEASON):
        for week in range(1, 11):
            pairs = _pairs(week)
            for number, (first, second) in enumerate(pairs):
                when = friday(season, week)
                upcoming = season == SEASON and week > played_weeks
                margin = strength[first] - strength[second] + rng.gauss(0, 14)
                margin = round(margin) or 1
                games.append(
                    _game(
                        f"{season}-{week}-{number}",
                        season,
                        when,
                        first,
                        second,
                        division,
                        None if upcoming else margin,
                        is_team_a_home=number % 2 == 0,
                    )
                )
    completed = [game for game in games if game.is_rateable]
    return League(teams=teams, games=games, result=backtest(completed))


def _pairs(week: int) -> list[tuple[str, str]]:
    """Give the games of a week. Week 10 pairs two teams with the team from another state."""
    if week == 10:
        return [(OHIO[0], OTHER), (OHIO[1], OHIO[2]), (OHIO[3], OHIO[4]), (OHIO[5], OHIO[6])]
    shift = week % 7 + 1
    pairs: list[tuple[str, str]] = []
    used: set[str] = set()
    for number, key in enumerate(OHIO):
        partner = OHIO[(number + shift) % len(OHIO)]
        if key in used or partner in used or partner == key:
            continue
        used.update((key, partner))
        pairs.append((key, partner))
    return pairs


def _game(
    key: str,
    season: int,
    when: date,
    first: str,
    second: str,
    division: dict[str, int],
    margin: int | None,
    *,
    is_team_a_home: bool,
) -> Game:
    result = "unknown" if margin is None else ("W" if margin > 0 else "L")
    scores = (None, None) if margin is None else (max(margin, 0) + 7, max(-margin, 0) + 7)
    return Game(
        game_key=key,
        season=season,
        game_date=when,
        team_a_key=first,
        team_a_name=first,
        team_b_key=second,
        team_b_name=second,
        team_a_result=result,
        team_a_program_id=first,
        team_b_program_id=second,
        team_a_division=division.get(first),
        team_b_division=division.get(second),
        is_team_a_home=is_team_a_home,
        is_team_b_home=not is_team_a_home,
        team_a_score=scores[0],
        team_b_score=scores[1],
        team_a_state="OH",
        team_b_state="OH" if second != OTHER else "PA",
    )
