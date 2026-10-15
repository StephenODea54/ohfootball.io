"""The OHSAA computer points of a season, and the order of the teams of a region.

The OHSAA ranks the teams of each region by an average of two levels of points. A win gives
Level 1 points by the division of the opponent. A tie gives half. Each win also gives Level 2
points: the Level 1 points of the defeated opponent. An opponent from another state gives the
points of its assigned division for each of its wins instead. The average is

    Level 1 / games played + 10 * Level 2 / divisor

The divisor assumes a full season of ten games for each opponent. It starts at 100 and loses ten
for each open date of the team and one for each open date of an opponent that the team has
played. At the end of the season the divisor is the sum of the counted games of the opponents.

Only a game that counts goes into the points. A canceled game, a playoff game and a game that the
OHSAA does not rate, such as a game against a club team, do not count. A team from another state
counts its first ten games only.

Source: the OHSAA Football Tournament Regulations, sections 5 and 7, and
https://ohsaa.org/sports/football/computerrankingsinfo.

This module is the plain reference of the rules. The simulation applies the same rules to many
seasons at once and is tested against this module.
"""

from __future__ import annotations

import random
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta

from .games import Result

# The Level 1 points of a win over a team of each division. These hold from 2013, when the OHSAA
# went to seven divisions.
_DIVISION_POINTS = {1: 6.5, 2: 6.0, 3: 5.5, 4: 5.0, 5: 4.5, 6: 4.0, 7: 3.5}
FIRST_SEVEN_DIVISION_SEASON = 2013
SEASON_WEEKS = 10
FULL_SCHEDULE = 10
# The OHSAA prints the average with four decimals. Two averages that agree to four decimals are a
# tie, and the third level of points breaks it.
AVERAGE_DECIMALS = 4

_SCORES: dict[str, float] = {"W": 1.0, "T": 0.5, "L": 0.0}


def division_points(season: int, division: int) -> float:
    """Give the Level 1 points of a win over a team of a division."""
    if season < FIRST_SEVEN_DIVISION_SEASON:
        raise ValueError(f"season {season} is before the seven divisions of 2013")
    if division not in _DIVISION_POINTS:
        raise ValueError(f"division {division} is not a division of the OHSAA")
    return _DIVISION_POINTS[division]


@dataclass(frozen=True, slots=True)
class PlayoffFormat:
    """How many teams of a region qualify, and how many of them get a bye or a home game."""

    qualifiers: int
    byes: int
    home_games: int
    # The playoff rounds that the better seed hosts. The games after them are on neutral fields.
    hosted_rounds: int = 3


def playoff_format(season: int) -> PlayoffFormat:
    """Give the playoff format of a season.

    From 2025, twelve teams of each region qualify. Seeds one to four get a bye and host the second
    round, seeds five to eight host the first round, and the better seed hosts the third round.
    From 2021 to 2024, sixteen teams of each region qualified and the better seed hosted the first
    two rounds. Before 2020, eight teams qualified and seeds one to four hosted the first round. In
    2020 every team could enter, so that season has no format here.
    """
    if season >= 2025:
        return PlayoffFormat(qualifiers=12, byes=4, home_games=8, hosted_rounds=3)
    if 2021 <= season <= 2024:
        return PlayoffFormat(qualifiers=16, byes=0, home_games=8, hosted_rounds=2)
    if FIRST_SEVEN_DIVISION_SEASON <= season <= 2019:
        return PlayoffFormat(qualifiers=8, byes=0, home_games=4, hosted_rounds=1)
    raise ValueError(f"season {season} has no playoff format")


@dataclass(frozen=True, slots=True)
class HarbinTeam:
    team_key: str
    is_ohio: bool
    # The division of an Ohio team, or the division that the OHSAA assigns to a team from another
    # state. None when the division is not known. A win over such a team gives no points.
    division: int | None
    region: int | None = None


@dataclass(frozen=True, slots=True)
class HarbinGame:
    game_key: str
    game_date: date
    team_a_key: str
    team_b_key: str
    team_a_result: Result
    # False for a game that the OHSAA does not rate.
    counts: bool = True
    is_playoff_game: bool = False
    # The result of team B when it is not the opposite of the result of team A. A double forfeit
    # is a loss for both teams.
    team_b_result: Result | None = None

    def scores(self) -> tuple[float, float] | None:
        """Give the scores of team A and team B, or None for a game without a result."""
        score = _SCORES.get(self.team_a_result)
        if score is None:
            return None
        if self.team_b_result is None:
            return score, 1.0 - score
        return score, _SCORES.get(self.team_b_result, 1.0 - score)


@dataclass(frozen=True, slots=True)
class HarbinLine:
    team_key: str
    wins: int
    losses: int
    ties: int
    level_one: float
    level_two: float
    # The sum of the Level 2 points of the defeated opponents. It breaks a tie in the average.
    level_three: float
    divisor: int
    average: float

    @property
    def games(self) -> int:
        return self.wins + self.losses + self.ties


def week_of(game_date: date, first_wednesday: date) -> int:
    """Give the week of the season of a date. A week runs from Wednesday to Tuesday."""
    return (game_date - first_wednesday).days // 7 + 1


def first_wednesday(week_one_game: date) -> date:
    """Give the Wednesday that starts the week of a game of week one."""
    return week_one_game - timedelta(days=(week_one_game.weekday() - 2) % 7)


def counted_games(
    games: Iterable[HarbinGame],
    teams: Mapping[str, HarbinTeam],
    *,
    last_day: date,
) -> tuple[HarbinGame, ...]:
    """Keep the games that go into the points.

    A game counts if the OHSAA rates it, it is not a playoff game, it is not canceled and it is on
    or before the last day of the regular season. A team from another state counts its first ten
    such games only, in the order of their dates, and a game counts only if it counts for both
    teams. A game without a result yet is kept, because it counts when it is played.
    """
    candidates = sorted(
        (
            game
            for game in games
            if game.counts
            and not game.is_playoff_game
            and game.team_a_result != "C"
            and game.game_date <= last_day
        ),
        key=lambda game: (game.game_date, game.game_key),
    )
    seen: defaultdict[str, int] = defaultdict(int)
    kept: list[HarbinGame] = []
    for game in candidates:
        over = False
        for key in (game.team_a_key, game.team_b_key):
            seen[key] += 1
            if not teams[key].is_ohio and seen[key] > FULL_SCHEDULE:
                over = True
        if not over:
            kept.append(game)
    return tuple(kept)


def standings(
    games: Iterable[HarbinGame],
    teams: Mapping[str, HarbinTeam],
    *,
    season: int,
    week: int,
    first_day: date,
) -> dict[str, HarbinLine]:
    """Give the points of each Ohio team after the games of a week.

    games must already be the counted games of the season. A game of a later week, or a game
    without a result, gives no points yet. first_day is the Wednesday that starts week one. A
    week of SEASON_WEEKS gives the final points.
    """
    played: list[tuple[HarbinGame, float, float]] = []
    weeks_played: defaultdict[str, int] = defaultdict(int)
    for game in games:
        scores = game.scores()
        if scores is None or week_of(game.game_date, first_day) > week:
            continue
        played.append((game, *scores))
        weeks_played[game.team_a_key] += 1
        weeks_played[game.team_b_key] += 1

    def points(key: str) -> float:
        division = teams[key].division
        return 0.0 if division is None else division_points(season, division)

    record: defaultdict[str, list[float]] = defaultdict(lambda: [0.0, 0.0, 0.0])
    level_one: defaultdict[str, float] = defaultdict(float)
    for game, score_a, score_b in played:
        for key, opponent, value in (
            (game.team_a_key, game.team_b_key, score_a),
            (game.team_b_key, game.team_a_key, score_b),
        ):
            record[key][_column(value)] += 1
            level_one[key] += value * points(opponent)

    def contribution(key: str) -> float:
        """Give the Level 2 points that a win over a team gives."""
        if teams[key].is_ohio:
            return level_one[key]
        wins, _, ties = record[key]
        return points(key) * (wins + 0.5 * ties)

    level_two: defaultdict[str, float] = defaultdict(float)
    opponents: defaultdict[str, list[str]] = defaultdict(list)
    for game, score_a, score_b in played:
        level_two[game.team_a_key] += score_a * contribution(game.team_b_key)
        level_two[game.team_b_key] += score_b * contribution(game.team_a_key)
        opponents[game.team_a_key].append(game.team_b_key)
        opponents[game.team_b_key].append(game.team_a_key)

    level_three: defaultdict[str, float] = defaultdict(float)
    for game, score_a, score_b in played:
        level_three[game.team_a_key] += score_a * level_two[game.team_b_key]
        level_three[game.team_b_key] += score_b * level_two[game.team_a_key]

    def open_dates(key: str) -> int:
        return max(0, week - weeks_played[key])

    lines: dict[str, HarbinLine] = {}
    for key, team in teams.items():
        if not team.is_ohio:
            continue
        wins, losses, ties = record[key]
        divisor = (
            FULL_SCHEDULE * SEASON_WEEKS
            - FULL_SCHEDULE * open_dates(key)
            - sum(open_dates(opponent) for opponent in opponents[key])
        )
        games_played = wins + losses + ties
        average = 0.0
        if games_played:
            average = level_one[key] / games_played
            if divisor > 0:
                average += FULL_SCHEDULE * level_two[key] / divisor
        lines[key] = HarbinLine(
            team_key=key,
            wins=int(wins),
            losses=int(losses),
            ties=int(ties),
            level_one=level_one[key],
            level_two=level_two[key],
            level_three=level_three[key],
            divisor=divisor,
            average=average,
        )
    return lines


def _column(value: float) -> int:
    return 0 if value == 1.0 else 1 if value == 0.0 else 2


def seed_region(
    lines: Sequence[HarbinLine],
    *,
    rng: random.Random | None = None,
) -> tuple[str, ...]:
    """Order the teams of a region from the first seed down.

    The higher average wins. Two averages that agree to four decimals are a tie, and the higher
    third level of points breaks it. The OHSAA then draws lots, so the order of a tie that remains
    is random when rng is given and follows the team key when it is not.

    The OHSAA uses other steps when a team from another state is part of the tie. This function
    does not apply them.
    """
    draw = {line.team_key: rng.random() if rng else 0.0 for line in lines}
    ordered = sorted(
        lines,
        key=lambda line: (
            -round(line.average, AVERAGE_DECIMALS),
            -line.level_three,
            draw[line.team_key],
            line.team_key,
        ),
    )
    return tuple(line.team_key for line in ordered)
