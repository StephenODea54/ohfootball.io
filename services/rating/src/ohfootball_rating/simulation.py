"""Play the rest of a regular season many times and seed each region at the end of each run.

Each run starts from the ratings of the day of the run. It plays the remaining games date by date.
A game gets a margin: the expected margin of the model plus an error drawn from the errors that
the model made in earlier seasons, in games of the same slope group. The ratings then move by the
same rule as in the backtest, so a team that wins in a run is stronger in its later games of that
run. After the last date, each run computes the points of every team and seeds each region.

The errors of the model are wider in a close game than in a game with a clear favorite. So a game
draws its error from the earlier games of its slope group whose expected margin was close to its
own, and the error is measured from the side of the favorite.

All runs of a chunk advance together. Each array holds one row for each run, and the loop goes
over the dates of the season only. The schedule is fixed, so the slope group and the learning
weight of each game are the same in every run, and the setup computes them one time.

A game without a rating, such as a game between two teams from other states, has no expected
margin. Its result is drawn from the records of the two teams, with one win and one loss added to
each record before the game.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date

import numpy as np

from .games import Game
from .harbin import (
    AVERAGE_DECIMALS,
    FULL_SCHEDULE,
    SEASON_WEEKS,
    HarbinGame,
    HarbinTeam,
    PlayoffFormat,
    division_points,
)
from .margin import PLAYOFF_BUCKET, MarginBacktestResult, MarginConfig, bucket, predict

# The width of a bin of the histogram of an average, and the highest average the histogram holds.
AVERAGE_BIN = 0.1
AVERAGE_LIMIT = 60.0
UNKNOWN_GAME_WIN_SHARE = 0.5
# The errors of a slope group are split into bands of the size of the expected margin. The last
# band holds every larger margin. A band with fewer errors than the minimum uses the whole group.
ERROR_BAND = 4.0
ERROR_BANDS = 10
MIN_BAND_ERRORS = 150


@dataclass(frozen=True)
class SeasonSetup:
    """Everything a run needs. The Ohio teams come first in every team array.

    The arrays of remaining games follow the order of the dates, and each date is one range of
    them in days.
    """

    season: int
    team_keys: tuple[str, ...]
    ohio_count: int
    # The Level 1 points of a win over each team.
    points: np.ndarray
    # The region of each Ohio team, or -1.
    regions: np.ndarray
    # Every counted game of the season.
    game_keys: tuple[str, ...]
    team_a: np.ndarray
    team_b: np.ndarray
    # The score of team A in a played game, or NaN in a game that the runs play.
    played_score: np.ndarray
    # The position of each remaining game among all games.
    remaining: np.ndarray
    # The start and the end of the range of each date among the remaining games.
    days: tuple[tuple[int, int], ...]
    # True for a date on which no team plays two rated games.
    days_without_repeats: tuple[bool, ...]
    # Per remaining game: True when the model rates it.
    rated: np.ndarray
    home_edge: np.ndarray
    weight_a: np.ndarray
    weight_b: np.ndarray
    # Per remaining game: the slope group of its errors. band_start and band_count give where the
    # errors of each group and band start in errors, and how many there are.
    error_group: np.ndarray
    band_start: np.ndarray
    band_count: np.ndarray
    errors: np.ndarray
    # The slope group whose errors the playoff games draw from.
    playoff_group: int
    # Per remaining game: a new program from another state that opens at the rating of its Ohio
    # opponent in this game, or -1, and that opponent.
    opening_team: np.ndarray
    opening_peer: np.ndarray
    # Per remaining game: the chance that team A wins by the records, for a game the model does
    # not rate.
    record_probability: np.ndarray
    ratings: np.ndarray
    # What the played games give, which is the same in every run: the Level 1 points and the wins
    # of each team, and the share of each played opponent that a team beat. beaten[o, t] is 1 when
    # team t beat team o, and one half for a tie.
    fixed_level_one: np.ndarray
    fixed_wins: np.ndarray
    beaten: np.ndarray
    final_games: np.ndarray
    final_divisor: np.ndarray
    playoff_format: PlayoffFormat
    margin_cap: float
    home_edge_points: float


def build_setup(
    *,
    season: int,
    teams: Mapping[str, HarbinTeam],
    harbin_games: Sequence[HarbinGame],
    games: Mapping[str, Game],
    result: MarginBacktestResult,
    playoff_format: PlayoffFormat,
    complete_schedules: frozenset[str] = frozenset(),
    config: MarginConfig | None = None,
) -> SeasonSetup:
    """Build the setup of a season from its counted games and the ratings of the backtest.

    harbin_games must be the counted games of the season. games maps the key of a game to its
    record in the rating, which gives the home team. A game without such a record has no home
    team and is not rated, so the records of its teams decide it.

    The games of a team from another state are often known only where it plays an Ohio team.
    Such a team is taken to play a full schedule, and it wins half of its unknown games. Its known
    games are mostly against Ohio teams that chose to play it, so they say little about the rest
    of its schedule. complete_schedules names the teams from other states whose whole schedule is
    known. Their missing games are open dates.
    """
    config = config or MarginConfig()
    ohio = sorted(key for key, team in teams.items() if team.is_ohio)
    other = sorted(key for key, team in teams.items() if not team.is_ohio)
    keys = tuple(ohio + other)
    index = {key: position for position, key in enumerate(keys)}
    ordered = sorted(harbin_games, key=lambda game: (game.game_date, game.game_key))

    team_a = np.array([index[game.team_a_key] for game in ordered], dtype=np.int64)
    team_b = np.array([index[game.team_b_key] for game in ordered], dtype=np.int64)
    scores = [game.scores() or (np.nan, np.nan) for game in ordered]
    played_score = np.array([score for score, _ in scores], dtype=np.float64)
    played_score_b = np.array([score for _, score in scores], dtype=np.float64)
    remaining = np.flatnonzero(np.isnan(played_score))
    days = _date_ranges([ordered[position].game_date for position in remaining])

    records = [games.get(ordered[position].game_key) for position in remaining]
    rated = np.array(
        [
            record is not None and (record.is_ohio_game or record.is_out_of_state_game)
            for record in records
        ],
        dtype=bool,
    )
    home_edge = np.array(
        [
            config.home_edge * (record.is_team_a_home - record.is_team_b_home) if record else 0.0
            for record in records
        ]
    )

    ratings, scored, played = _pregame_state(
        season,
        keys,
        index,
        [record for record, is_rated in zip(records, rated, strict=True) if is_rated],
        result,
        config,
    )
    errors, groups, band_start, band_count = _errors(result, season, config)
    largest = int(np.argmax(band_count.sum(axis=1))) if len(groups) else 0
    weight_a = np.zeros(len(remaining))
    weight_b = np.zeros(len(remaining))
    error_group = np.zeros(len(remaining), dtype=np.int64)
    opening_team = np.full(len(remaining), -1, dtype=np.int64)
    opening_peer = np.full(len(remaining), -1, dtype=np.int64)
    new_programs = _new_programs(season, keys, len(ohio), records, rated, result)
    repeats: list[bool] = []
    for start, end in days:
        seen: set[int] = set()
        repeated = False
        for column in range(start, end):
            if not rated[column]:
                continue
            a, b = int(team_a[remaining[column]]), int(team_b[remaining[column]])
            repeated = repeated or a in seen or b in seen
            seen.update((a, b))
            name = bucket(int(played[a]), int(played[b]), False, config)
            error_group[column] = groups.get(name, largest)
            for new, peer in ((a, b), (b, a)):
                if new in new_programs:
                    new_programs.discard(new)
                    opening_team[column], opening_peer[column] = new, peer
            weight_a[column] = config.learning_weight(int(scored[a]))
            weight_b[column] = config.learning_weight(int(scored[b]))
            # In a game against a team from another state, the Ohio team moves by a share of its
            # change, and the other team moves by its full change.
            if b >= len(ohio):
                weight_a[column] *= config.other_state_weight
            if a >= len(ohio):
                weight_b[column] *= config.other_state_weight
        repeats.append(not repeated)
        # Every rated game of the date counts toward the next date, as in the backtest.
        for column in range(start, end):
            if rated[column]:
                for team in (team_a[remaining[column]], team_b[remaining[column]]):
                    scored[team] += 1
                    played[team] += 1

    points = np.array(
        [
            division_points(season, teams[key].division) if teams[key].division else 0.0
            for key in keys
        ]
    )
    regions = np.array(
        [teams[key].region if teams[key].region is not None else -1 for key in ohio],
        dtype=np.int64,
    )
    final_games = np.bincount(team_a, minlength=len(keys)) + np.bincount(
        team_b, minlength=len(keys)
    )
    unknown = np.array(
        [
            0 if position < len(ohio) or key in complete_schedules else 1
            for position, key in enumerate(keys)
        ],
        dtype=bool,
    )
    added_games = np.where(unknown, np.maximum(0, FULL_SCHEDULE - final_games), 0)
    final_games = final_games + added_games
    open_dates = np.maximum(0, SEASON_WEEKS - final_games)
    opponent_open = np.bincount(
        team_a, weights=open_dates[team_b], minlength=len(keys)
    ) + np.bincount(team_b, weights=open_dates[team_a], minlength=len(keys))
    final_divisor = FULL_SCHEDULE * SEASON_WEEKS - FULL_SCHEDULE * open_dates - opponent_open

    done = ~np.isnan(played_score)
    won, lost = played_score[done], played_score_b[done]
    done_a, done_b = team_a[done], team_b[done]
    fixed_level_one = np.bincount(
        done_a, weights=won * points[done_b], minlength=len(keys)
    ) + np.bincount(done_b, weights=lost * points[done_a], minlength=len(keys))
    fixed_wins = np.bincount(done_a, weights=won, minlength=len(keys)) + np.bincount(
        done_b, weights=lost, minlength=len(keys)
    )
    fixed_wins = fixed_wins + UNKNOWN_GAME_WIN_SHARE * added_games
    beaten = np.zeros((len(keys), len(keys)))
    np.add.at(beaten, (done_b, done_a), won)
    np.add.at(beaten, (done_a, done_b), lost)

    return SeasonSetup(
        season=season,
        team_keys=keys,
        ohio_count=len(ohio),
        points=points,
        regions=regions,
        game_keys=tuple(game.game_key for game in ordered),
        team_a=team_a,
        team_b=team_b,
        played_score=played_score,
        remaining=remaining,
        days=days,
        days_without_repeats=tuple(repeats),
        rated=rated,
        home_edge=home_edge,
        weight_a=weight_a,
        weight_b=weight_b,
        error_group=error_group,
        playoff_group=groups.get(PLAYOFF_BUCKET, largest),
        band_start=band_start,
        band_count=band_count,
        errors=errors,
        opening_team=opening_team,
        opening_peer=opening_peer,
        record_probability=_record_probability(
            team_a, team_b, played_score, played_score_b, len(keys)
        )[remaining],
        ratings=ratings,
        fixed_level_one=fixed_level_one,
        fixed_wins=fixed_wins,
        beaten=beaten,
        final_games=final_games,
        final_divisor=final_divisor[: len(ohio)].astype(np.float64),
        playoff_format=playoff_format,
        margin_cap=config.margin_cap,
        home_edge_points=config.home_edge,
    )


def _date_ranges(dates: Sequence[date]) -> tuple[tuple[int, int], ...]:
    ranges: list[tuple[int, int]] = []
    start = 0
    for position in range(1, len(dates) + 1):
        if position == len(dates) or dates[position] != dates[start]:
            ranges.append((start, position))
            start = position
    return tuple(ranges)


def _pregame_state(
    season: int,
    keys: Sequence[str],
    index: Mapping[str, int],
    upcoming: Sequence[Game],
    result: MarginBacktestResult,
    config: MarginConfig,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Give the rating, the scored games and the games played of each team before the runs.

    The prediction of the first remaining game of a team holds the rating that the team carries
    into the runs, with the same opening rules as the published predictions.
    """
    ratings = np.zeros(len(keys))
    scored = np.zeros(len(keys), dtype=np.int64)
    played = np.zeros(len(keys), dtype=np.int64)
    for key, position in index.items():
        rating_key = (season, key)
        if rating_key in result.ratings:
            ratings[position] = result.ratings[rating_key]
            scored[position] = result.scored_games.get(rating_key, 0)
            played[position] = result.games_played.get(rating_key, 0)
        elif rating_key in result.other_state.ratings:
            ratings[position] = result.other_state.ratings[rating_key]
            scored[position] = result.other_state.games_played.get(rating_key, 0)
            played[position] = scored[position]
    seen: set[str] = set()
    for prediction in predict(upcoming, result, config):
        for key, rating in (
            (prediction.team_a_key, prediction.team_a_rating),
            (prediction.team_b_key, prediction.team_b_rating),
        ):
            if key not in seen and key in index:
                seen.add(key)
                ratings[index[key]] = rating
    return ratings, scored, played


def _record_probability(
    team_a: np.ndarray,
    team_b: np.ndarray,
    played_score: np.ndarray,
    played_score_b: np.ndarray,
    team_count: int,
) -> np.ndarray:
    """Give the chance that team A wins by the records of the two teams, by log5."""
    played = ~np.isnan(played_score)
    score = played_score[played]
    wins = np.bincount(team_a[played], weights=score, minlength=team_count) + np.bincount(
        team_b[played], weights=played_score_b[played], minlength=team_count
    )
    games = np.bincount(team_a[played], minlength=team_count) + np.bincount(
        team_b[played], minlength=team_count
    )
    share = (wins + 1.0) / (games + 2.0)
    first, second = share[team_a], share[team_b]
    return first * (1 - second) / (first * (1 - second) + second * (1 - first))


def _new_programs(
    season: int,
    keys: Sequence[str],
    ohio_count: int,
    records: Sequence[Game | None],
    rated: np.ndarray,
    result: MarginBacktestResult,
) -> set[int]:
    """Find the teams from other states that open at the rating of their first Ohio opponent.

    Such a team has no rating yet this season, and its program has no earlier season against
    Ohio teams. The backtest opens it in its first game, so a run opens it there too.
    """
    history = result.other_state.program_history
    programs: dict[str, str] = {}
    for record, is_rated in zip(records, rated, strict=True):
        if record is not None and is_rated:
            programs.setdefault(record.team_a_key, record.team_a_program_id or record.team_a_key)
            programs.setdefault(record.team_b_key, record.team_b_program_id or record.team_b_key)
    found: set[int] = set()
    for position in range(ohio_count, len(keys)):
        key = keys[position]
        if key not in programs or (season, key) in result.other_state.ratings:
            continue
        if not any(played < season for played in history.get(programs[key], {})):
            found.add(position)
    return found


def _errors(
    result: MarginBacktestResult, season: int, config: MarginConfig
) -> tuple[np.ndarray, dict[str, int], np.ndarray, np.ndarray]:
    """Collect the errors of the model over the slope window before a season.

    An error is the actual margin minus the expected margin, seen from the side of the favorite,
    so a positive error means that the favorite won by more than expected. The errors go into one
    array, sorted by slope group and then by band, so a chunk draws the errors of a whole date
    with one call. The other values give the number of each group, and where the errors of each
    group and band start and how many there are. A band with too few errors points at the whole
    group.
    """
    grouped: defaultdict[str, list[tuple[int, float]]] = defaultdict(list)
    for prediction in result.predictions:
        if (
            prediction.is_ohio_game
            and prediction.actual_margin is not None
            and season - config.slope_seasons <= prediction.season < season
        ):
            expected = prediction.predicted_margin
            side = 1.0 if expected >= 0 else -1.0
            grouped[prediction.bucket].append(
                (_band(abs(expected)), side * (prediction.actual_margin - expected))
            )
    groups = {name: number for number, name in enumerate(sorted(grouped))}
    band_start = np.zeros((len(groups), ERROR_BANDS), dtype=np.int64)
    band_count = np.zeros((len(groups), ERROR_BANDS), dtype=np.int64)
    values: list[float] = []
    for name, number in groups.items():
        rows = sorted(grouped[name])
        first = len(values)
        values.extend(error for _, error in rows)
        bands = np.array([band for band, _ in rows])
        for band in range(ERROR_BANDS):
            count = int((bands == band).sum())
            if count >= MIN_BAND_ERRORS:
                band_start[number, band] = first + int((bands < band).sum())
                band_count[number, band] = count
            else:
                band_start[number, band] = first
                band_count[number, band] = len(rows)
    return np.array(values), groups, band_start, band_count


def _band(size: float | np.ndarray) -> int | np.ndarray:
    """Give the band of the size of an expected margin."""
    if isinstance(size, np.ndarray):
        return np.minimum((size / ERROR_BAND).astype(np.int64), ERROR_BANDS - 1)
    return min(int(size / ERROR_BAND), ERROR_BANDS - 1)


@dataclass
class SeasonDraws:
    """The results of one chunk of runs."""

    # True where team A wins a remaining game, in the order of SeasonSetup.remaining.
    team_a_wins: np.ndarray
    level_one: np.ndarray
    level_two: np.ndarray
    average: np.ndarray
    # The place of each Ohio team in its region, from 1. Zero for a team without a region.
    place: np.ndarray
    # The rating of each team after the last date.
    ratings: np.ndarray
    # True for the Ohio team that wins its region in the playoffs of the run.
    region_champion: np.ndarray


def simulate(setup: SeasonSetup, runs: int, rng: np.random.Generator) -> SeasonDraws:
    """Play the remaining games of a chunk of runs, then compute the points and the places."""
    ratings = np.tile(setup.ratings, (runs, 1))
    wins = np.zeros((runs, len(setup.remaining)), dtype=bool)
    cap = setup.margin_cap
    for (start, end), without_repeats in zip(setup.days, setup.days_without_repeats, strict=True):
        columns = np.arange(start, end)
        rated = columns[setup.rated[start:end]]
        if len(rated):
            games = setup.remaining[rated]
            a, b = setup.team_a[games], setup.team_b[games]
            opens = rated[setup.opening_team[rated] >= 0]
            if len(opens):
                ratings[:, setup.opening_team[opens]] = ratings[:, setup.opening_peer[opens]]
            expected = ratings[:, a] - ratings[:, b] + setup.home_edge[rated]
            margin = _margins(setup, expected, setup.error_group[rated], rng)
            surprise = np.clip(margin, -cap, cap) - np.clip(expected, -cap, cap)
            if without_repeats:
                ratings[:, a] += setup.weight_a[rated] * surprise
                ratings[:, b] -= setup.weight_b[rated] * surprise
            else:
                np.add.at(ratings, (slice(None), a), setup.weight_a[rated] * surprise)
                np.add.at(ratings, (slice(None), b), -setup.weight_b[rated] * surprise)
            wins[:, rated] = margin > 0
        unrated = columns[~setup.rated[start:end]]
        if len(unrated):
            wins[:, unrated] = rng.random((runs, len(unrated))) < setup.record_probability[unrated]

    level_one, level_two, average, place = harbin_points(setup, wins, rng)
    return SeasonDraws(
        team_a_wins=wins,
        level_one=level_one,
        level_two=level_two,
        average=average,
        place=place,
        ratings=ratings,
        region_champion=region_champions(setup, ratings, place, rng),
    )


def _margins(
    setup: SeasonSetup, expected: np.ndarray, groups: np.ndarray | int, rng: np.random.Generator
) -> np.ndarray:
    """Draw the margin of each game: the expected margin plus an error of its group and band."""
    band = _band(np.abs(expected))
    draw = setup.band_start[groups, band] + (
        rng.random(expected.shape) * setup.band_count[groups, band]
    ).astype(np.int64)
    side = np.where(expected >= 0, 1.0, -1.0)
    return expected + side * setup.errors[draw]


def bracket_order(size: int) -> list[int]:
    """Give the seeds of a bracket from top to bottom, so seed 1 meets the last seed first.

    A bracket of 16 reads 1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11.
    """
    order = [1]
    while len(order) < size:
        total = 2 * len(order) + 1
        order = [seed for top in order for seed in (top, total - top)]
    return order


def region_champions(
    setup: SeasonSetup, ratings: np.ndarray, place: np.ndarray, rng: np.random.Generator
) -> np.ndarray:
    """Play the playoff games of each region in each run, and mark the team that wins it.

    The qualifiers fill a bracket of the next power of two, and a place without a qualifier is a
    bye, so from 2025 seeds one to four meet the winners of the first round. The better seed
    hosts the games of the hosted rounds of the format, and the later games are on neutral fields.
    A round counts from the first round of the bracket, so a bye is a hosted round too. A game
    draws its error from the errors of earlier playoff games. The ratings stay as they were at the
    end of the regular season.
    """
    runs = place.shape[0]
    champion = np.zeros(place.shape, dtype=bool)
    every_run = np.arange(runs)[:, None]
    for region in np.unique(setup.regions[setup.regions >= 0]):
        members = np.flatnonzero(setup.regions == region)
        qualifiers = min(setup.playoff_format.qualifiers, len(members))
        size = 1 << max(qualifiers - 1, 0).bit_length()
        by_place = members[np.argsort(place[:, members], axis=1)]
        seeds = np.array(bracket_order(size))
        team = np.where(seeds <= qualifiers, by_place[:, np.minimum(seeds, qualifiers) - 1], -1)
        seed = np.broadcast_to(seeds, team.shape)
        played_rounds = 0
        while team.shape[1] > 1:
            played_rounds += 1
            first, second = team[:, 0::2], team[:, 1::2]
            first_seed, second_seed = seed[:, 0::2], seed[:, 1::2]
            played = (first >= 0) & (second >= 0)
            hosted = played_rounds <= setup.playoff_format.hosted_rounds
            host = setup.home_edge_points if hosted else 0.0
            expected = (
                ratings[every_run, np.maximum(first, 0)]
                - ratings[every_run, np.maximum(second, 0)]
                + np.where(first_seed < second_seed, host, -host)
            )
            first_wins = np.where(
                played, _margins(setup, expected, setup.playoff_group, rng) > 0, second < 0
            )
            team = np.where(first_wins, first, second)
            seed = np.where(first_wins, first_seed, second_seed)
        champion[every_run[:, 0], team[:, 0]] = team[:, 0] >= 0
    return champion


def harbin_points(
    setup: SeasonSetup, wins: np.ndarray, rng: np.random.Generator
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Compute the final points and the places of every run from the results of its games.

    The played games give the same Level 1 points and the same wins in every run, so only the
    remaining games are added up for each run. Level 2 still needs every game, because the points
    of an opponent change from run to run. The played games give it through one product with the
    fixed matrix of beaten opponents.
    """
    runs = wins.shape[0]
    teams = len(setup.team_keys)
    ohio = setup.ohio_count
    team_a = setup.team_a[setup.remaining]
    team_b = setup.team_b[setup.remaining]
    score = wins.astype(np.float64)
    loss = 1.0 - score
    offset = (np.arange(runs) * teams)[:, None]
    flat_a = (offset + team_a).ravel()
    flat_b = (offset + team_b).ravel()

    def to_teams(for_a: np.ndarray, for_b: np.ndarray) -> np.ndarray:
        """Add a value of each remaining game to team A and another value to team B."""
        total = np.bincount(flat_a, weights=for_a.ravel(), minlength=runs * teams)
        total += np.bincount(flat_b, weights=for_b.ravel(), minlength=runs * teams)
        return total.reshape(runs, teams)

    points = setup.points
    level_one = setup.fixed_level_one + to_teams(score * points[team_b], loss * points[team_a])
    contribution = level_one.copy()
    team_wins = setup.fixed_wins + to_teams(score, loss)
    contribution[:, ohio:] = points[ohio:] * team_wins[:, ohio:]

    def over_opponents(values: np.ndarray) -> np.ndarray:
        """Sum a value of the defeated opponents of each team, with half the value for a tie."""
        return values @ setup.beaten + to_teams(score * values[:, team_b], loss * values[:, team_a])

    level_two = over_opponents(contribution)
    level_three = over_opponents(level_two)

    level_one, level_two, level_three = (
        values[:, :ohio] for values in (level_one, level_two, level_three)
    )
    games = setup.final_games[:ohio]
    average = np.where(games > 0, level_one / np.maximum(games, 1), 0.0)
    average += np.where(
        setup.final_divisor > 0,
        FULL_SCHEDULE * level_two / np.maximum(setup.final_divisor, 1),
        0.0,
    )
    place = _places(setup, average, level_three, rng)
    return level_one, level_two, average, place


def _places(
    setup: SeasonSetup, average: np.ndarray, level_three: np.ndarray, rng: np.random.Generator
) -> np.ndarray:
    """Give the place of each team in its region in each run.

    The average to four decimals comes first, then the third level of points, then a random draw.
    The three go into one number: the two levels are whole numbers after scaling, and the draw is
    below one, so it decides only a full tie.
    """
    runs = average.shape[0]
    first = np.round(average * 10**AVERAGE_DECIMALS)
    # A tie counts half, and a tie of an opponent counts half again, so the third level is a whole
    # number of sixteenths.
    second = np.round(level_three * 16)
    key = first * 1e6 + second + rng.random(average.shape) * 0.5
    place = np.zeros(average.shape, dtype=np.int16)
    for region in np.unique(setup.regions[setup.regions >= 0]):
        members = np.flatnonzero(setup.regions == region)
        order = np.argsort(-key[:, members], axis=1)
        ranks = np.empty_like(order)
        ranks[np.arange(runs)[:, None], order] = np.arange(1, len(members) + 1)
        place[:, members] = ranks
    return place


def season_games(
    games: Iterable[Game], counts: Mapping[str, bool] | None = None
) -> tuple[HarbinGame, ...]:
    """Turn the games of the rating into the games of the points."""
    counts = counts or {}
    return tuple(
        HarbinGame(
            game_key=game.game_key,
            game_date=game.game_date,
            team_a_key=game.team_a_key,
            team_b_key=game.team_b_key,
            team_a_result=game.team_a_result,
            counts=counts.get(game.game_key, True),
            is_playoff_game=game.is_playoff_game,
        )
        for game in games
    )
