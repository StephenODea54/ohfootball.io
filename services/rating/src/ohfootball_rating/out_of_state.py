"""Teams from other states: the state of a team and the rating that a new program opens with.

The rating knows a team from another state only from its games against Ohio teams. A program of
that kind that has not played an Ohio team in an earlier season opens at a value learned from the
seasons before: the rating that such games implied for the opponents of Ohio teams of the same
division, shrunk toward the mean of that division for the state of the team.
"""

from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass, field

OHIO = "OH"
UNKNOWN_STATE = "UNK"
_STATE = re.compile(r"^[A-Z]{2}$")
_NAME_SUFFIX = re.compile(r"\(([A-Z]{2})\)\s*$")


def state_label(state_code: str | None, name: str) -> str:
    """Give the two-letter state of a team, or UNK.

    The warehouse holds values such as REGION 0, or nothing, for some teams from other states.
    Then the two letters in brackets at the end of the name are the state, as in Crum (WV). Only a
    state_code of OH makes an Ohio team, as in the publisher and the API, so a name that ends in
    (OH) without that code gives UNK.
    """
    code = (state_code or "").strip()
    if _STATE.fullmatch(code):
        return code
    match = _NAME_SUFFIX.search(name or "")
    if match and match.group(1) != OHIO:
        return match.group(1)
    return UNKNOWN_STATE


@dataclass(frozen=True, slots=True)
class OpeningEstimates:
    """The ratings that a new program from another state opens with in one season."""

    division_means: Mapping[int, float] = field(default_factory=dict)
    cells: Mapping[tuple[str, int], float] = field(default_factory=dict)

    def opening(self, state: str, division: int | None) -> float:
        """Give the rating of a new program from another state against an Ohio team.

        The estimate of its state and the division of the Ohio team comes first, then the mean of
        that division, then 0. An Ohio team without a division gives 0.
        """
        if division is None:
            return 0.0
        return self.cells.get((state, division), self.division_means.get(division, 0.0))


@dataclass(slots=True)
class ImpliedRatings:
    """The rating that each game of an Ohio team against another state implied for the opponent.

    implied = pregame rating of the Ohio team + home term - capped margin. The sums are kept for
    each season, so the estimates of a season read only the seasons before it.
    """

    _by_division: defaultdict[tuple[int, int], list[float]] = field(
        default_factory=lambda: defaultdict(lambda: [0.0, 0])
    )
    _by_cell: defaultdict[tuple[int, str, int], list[float]] = field(
        default_factory=lambda: defaultdict(lambda: [0.0, 0])
    )

    def record(self, season: int, state: str, division: int, implied: float) -> None:
        for key, sums in (
            ((season, division), self._by_division),
            ((season, state, division), self._by_cell),
        ):
            total = sums[key]
            total[0] += implied
            total[1] += 1

    def estimates(
        self, season: int, *, window_seasons: int, min_games: int, shrinkage: float
    ) -> OpeningEstimates:
        """Give the openings of a season from the seasons in the window before it.

        The mean of a division needs at least min_games games. The estimate of a state and a
        division is (sum of its games + shrinkage * mean of the division) / (its games +
        shrinkage), so a state with few games stays near the mean of the division. The sums run
        from the earliest season up, so the result does not depend on the order of the records.
        """
        first = season - window_seasons
        means: dict[int, float] = {}
        for division in sorted({division for _, division in self._by_division}):
            total, count = 0.0, 0
            for earlier in range(first, season):
                sums = self._by_division.get((earlier, division))
                if sums:
                    total, count = total + sums[0], count + sums[1]
            if count >= min_games:
                means[division] = total / count
        cells: dict[tuple[str, int], list[float]] = {}
        for (earlier, state, division), sums in sorted(self._by_cell.items()):
            if first <= earlier < season and division in means:
                cell = cells.setdefault((state, division), [0.0, 0])
                cell[0] += sums[0]
                cell[1] += sums[1]
        return OpeningEstimates(
            division_means=means,
            cells={
                key: (total + shrinkage * means[key[1]]) / (count + shrinkage)
                for key, (total, count) in cells.items()
            },
        )
