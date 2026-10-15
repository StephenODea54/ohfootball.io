"""Count the results of the runs and turn the counts into the odds that the site shows.

A tally keeps counts only, so the runs of many chunks and many processes add up without keeping
each run. For each Ohio team it counts, by the number of its remaining games that it wins, the
place in the region and the final average. It also counts, for each of its remaining games, the
runs in which the team won that game and the runs in which it lost it, and the runs in which it
won its region in the playoffs.
"""

from __future__ import annotations

from collections.abc import Sequence
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field

import numpy as np

from .harbin import PlayoffFormat
from .simulation import AVERAGE_BIN, AVERAGE_LIMIT, SeasonSetup, simulate

BINS = int(round(AVERAGE_LIMIT / AVERAGE_BIN))


@dataclass(frozen=True)
class OwnGames:
    """The remaining games of each Ohio team, in the order of their dates."""

    # The column of each game in SeasonDraws.team_a_wins, or -1 where a team has fewer games.
    columns: np.ndarray
    # True where the team is team A of the game.
    is_team_a: np.ndarray
    counts: np.ndarray


def own_games(setup: SeasonSetup) -> OwnGames:
    remaining = setup.remaining
    ohio = setup.ohio_count
    lists: list[list[tuple[int, bool]]] = [[] for _ in range(ohio)]
    for column, game in enumerate(remaining):
        for team, is_a in ((setup.team_a[game], True), (setup.team_b[game], False)):
            if team < ohio:
                lists[team].append((column, is_a))
    width = max((len(games) for games in lists), default=0)
    columns = np.full((ohio, max(width, 1)), -1, dtype=np.int64)
    is_team_a = np.zeros((ohio, max(width, 1)), dtype=bool)
    for team, games in enumerate(lists):
        for position, (column, is_a) in enumerate(games):
            columns[team, position] = column
            is_team_a[team, position] = is_a
    return OwnGames(
        columns=columns,
        is_team_a=is_team_a,
        counts=np.array([len(games) for games in lists], dtype=np.int64),
    )


def own_results(own: OwnGames, team_a_wins: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Give, for each run, team and own remaining game, whether the team won it, and where a game
    is there at all."""
    present = own.columns >= 0
    if team_a_wins.shape[1] == 0:
        return np.zeros((team_a_wins.shape[0], *own.columns.shape), dtype=bool), present
    won = team_a_wins[:, np.where(present, own.columns, 0)]
    return np.where(own.is_team_a, won, ~won) & present, present


@dataclass
class Tally:
    places: int
    regions: np.ndarray
    # The width of the widest list of own remaining games.
    games: int = 1
    runs: int = 0
    # For each team and number of remaining games won: the runs that end in each place, from
    # place 1. Column 0 counts the runs of a team without a region.
    record_place: np.ndarray = field(init=False)
    # For each team and number of remaining games won: the runs whose final average falls in each
    # bin.
    record_average: np.ndarray = field(init=False)
    # For each team, own remaining game and result (0 a loss, 1 a win): the runs, the runs in
    # which the team qualified, and the runs in which it played at home.
    game_odds: np.ndarray = field(init=False)
    # The runs in which each team won its region in the playoffs.
    region_wins: np.ndarray = field(init=False)

    def __post_init__(self) -> None:
        teams = len(self.regions)
        self.record_place = np.zeros((teams, self.games + 1, self.places + 1), dtype=np.int64)
        self.record_average = np.zeros((teams, self.games + 1, BINS), dtype=np.int32)
        self.game_odds = np.zeros((teams, self.games, 2, 3), dtype=np.int64)
        self.region_wins = np.zeros(teams, dtype=np.int64)

    def add(self, other: Tally) -> None:
        self.runs += other.runs
        self.record_place += other.record_place
        self.record_average += other.record_average
        self.game_odds += other.game_odds
        self.region_wins += other.region_wins


def tally_chunk(setup: SeasonSetup, own: OwnGames, total: Tally, runs: int, seed: int) -> None:
    """Play one chunk of runs and add it to a tally."""
    draws = simulate(setup, runs, np.random.default_rng(seed))
    total.runs += runs
    total.region_wins += draws.region_champion.sum(axis=0)
    won, present = own_results(own, draws.team_a_wins)
    teams = setup.ohio_count
    record = (np.arange(teams) * (total.games + 1) + won.sum(axis=2)).ravel()
    place = np.minimum(draws.place, total.places).ravel()
    total.record_place += np.bincount(
        record * (total.places + 1) + place, minlength=total.record_place.size
    ).reshape(total.record_place.shape)
    total.record_average += (
        np.bincount(
            record * BINS + _bins(draws.average).ravel(), minlength=total.record_average.size
        )
        .reshape(total.record_average.shape)
        .astype(np.int32)
    )
    fmt = setup.playoff_format
    ranked = draws.place >= 1
    outcomes = (
        ranked & (draws.place <= fmt.qualifiers),
        ranked & (draws.place <= fmt.home_games),
    )
    for result in (0, 1):
        took = present & (won == bool(result))
        total.game_odds[:, :, result, 0] += took.sum(axis=0)
        for column, outcome in enumerate(outcomes, start=1):
            total.game_odds[:, :, result, column] += (took & outcome[:, :, None]).sum(axis=0)


def _bins(values: np.ndarray) -> np.ndarray:
    return np.clip((values / AVERAGE_BIN).astype(np.int64), 0, BINS - 1)


def run_projection(
    setup: SeasonSetup,
    *,
    runs: int,
    seed: int,
    chunk: int = 1000,
    workers: int = 1,
) -> Tally:
    """Play all runs in chunks, in parallel processes when workers is above one.

    Each chunk has a seed of its own, taken from seed, so the result depends on seed, runs and
    chunk only, and not on the number of workers. Each process adds up its own chunks and sends
    back one tally.
    """
    own = own_games(setup)
    places = int(max(np.bincount(setup.regions[setup.regions >= 0]).max(initial=0), 1))
    sizes = [min(chunk, runs - start) for start in range(0, runs, chunk)]
    seeds = np.random.SeedSequence(seed).generate_state(len(sizes)).tolist()
    jobs = list(zip(sizes, seeds, strict=True))
    if workers <= 1:
        return _tally_jobs(setup, own, places, jobs)
    batches = [jobs[start::workers] for start in range(workers) if jobs[start::workers]]
    total = Tally(places=places, regions=setup.regions, games=own.columns.shape[1])
    with ProcessPoolExecutor(max_workers=len(batches)) as pool:
        arguments = [(setup, own, places, batch) for batch in batches]
        for tally in pool.map(_tally_jobs, *zip(*arguments, strict=True)):
            total.add(tally)
    return total


def _tally_jobs(
    setup: SeasonSetup, own: OwnGames, places: int, jobs: Sequence[tuple[int, int]]
) -> Tally:
    total = Tally(places=places, regions=setup.regions, games=own.columns.shape[1])
    for size, chunk_seed in jobs:
        tally_chunk(setup, own, total, size, chunk_seed)
    return total


@dataclass(frozen=True, slots=True)
class RecordOdds:
    """The odds of a team when it ends the regular season with one record."""

    wins: int
    losses: int
    probability: float
    runs: int
    # The final average at the 5th, the 50th and the 95th percentile of the runs.
    low_average: float
    median_average: float
    high_average: float
    qualify: float
    home: float
    bye: float


@dataclass(frozen=True, slots=True)
class GameOdds:
    """The odds of a team in the runs in which it won one of its remaining games, and in the runs
    in which it lost it. None when no run had that result."""

    qualify_if_win: float | None
    qualify_if_loss: float | None
    home_if_win: float | None
    home_if_loss: float | None


@dataclass(frozen=True, slots=True)
class TeamOutlook:
    team_key: str
    region: int
    qualify: float
    home: float
    bye: float
    # The chance to win the region in the playoffs.
    region_win: float
    # The mean place of the team in its region over the runs.
    expected_seed: float
    # The final records of the team, from the most wins.
    records: tuple[RecordOdds, ...]
    # One for each remaining game of the team, in the order of their dates.
    games: tuple[GameOdds, ...]


def outlooks(
    setup: SeasonSetup, tally: Tally, current_wins: Sequence[int], current_losses: Sequence[int]
) -> tuple[TeamOutlook, ...]:
    """Turn the counts into the odds of each Ohio team that has a region."""
    own = own_games(setup)
    fmt = setup.playoff_format
    result: list[TeamOutlook] = []
    for team in range(setup.ohio_count):
        region = int(setup.regions[team])
        if region < 0:
            continue
        games = int(own.counts[team])
        placed = tally.record_place[team]
        everything = placed.sum(axis=0)
        records = tuple(
            _record_odds(
                placed[wins],
                tally.record_average[team, wins],
                wins=current_wins[team] + wins,
                losses=current_losses[team] + games - wins,
                total=tally.runs,
                fmt=fmt,
            )
            for wins in range(games, -1, -1)
            if placed[wins].sum()
        )
        seeds = np.arange(len(everything))
        result.append(
            TeamOutlook(
                team_key=setup.team_keys[team],
                region=region,
                qualify=_share(everything, fmt.qualifiers),
                home=_share(everything, fmt.home_games),
                bye=_share(everything, fmt.byes),
                region_win=float(tally.region_wins[team] / tally.runs),
                expected_seed=float((seeds * everything).sum() / tally.runs),
                records=records,
                games=tuple(_game_odds(tally.game_odds[team, game]) for game in range(games)),
            )
        )
    return tuple(result)


def _record_odds(
    placed: np.ndarray,
    averages: np.ndarray,
    *,
    wins: int,
    losses: int,
    total: int,
    fmt: PlayoffFormat,
) -> RecordOdds:
    low, middle, high = _quantiles(averages, (0.05, 0.5, 0.95))
    runs = int(placed.sum())
    return RecordOdds(
        wins=wins,
        losses=losses,
        probability=runs / total,
        runs=runs,
        low_average=low,
        median_average=middle,
        high_average=high,
        qualify=_share(placed, fmt.qualifiers),
        home=_share(placed, fmt.home_games),
        bye=_share(placed, fmt.byes),
    )


def _game_odds(counts: np.ndarray) -> GameOdds:
    """Turn the counts of one game into odds. counts holds a row for a loss and a row for a win."""

    def share(result: int, column: int) -> float | None:
        runs = counts[result, 0]
        return float(counts[result, column] / runs) if runs else None

    return GameOdds(
        qualify_if_win=share(1, 1),
        qualify_if_loss=share(0, 1),
        home_if_win=share(1, 2),
        home_if_loss=share(0, 2),
    )


def _share(placed: np.ndarray, cut: int) -> float:
    runs = placed.sum()
    if cut <= 0 or runs == 0:
        return 0.0
    return float(placed[1 : cut + 1].sum() / runs)


def _quantiles(histogram: np.ndarray, shares: Sequence[float]) -> tuple[float, ...]:
    """Read quantiles from a histogram of averages.

    The runs of a bin are taken to spread evenly across it, so a quantile falls inside its bin in
    proportion to the runs below it. The value is rounded to two decimals, the precision that the
    site shows.
    """
    total = histogram.sum()
    if total == 0:
        return tuple(0.0 for _ in shares)
    cumulative = np.cumsum(histogram)
    values: list[float] = []
    for share in shares:
        target = share * total
        index = int(np.searchsorted(cumulative, target))
        below = cumulative[index - 1] if index > 0 else 0
        fraction = (target - below) / histogram[index]
        values.append(round(float((index + fraction) * AVERAGE_BIN), 2))
    return tuple(values)
