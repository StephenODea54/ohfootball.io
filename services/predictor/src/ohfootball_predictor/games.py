"""The game record and the one rule that decides if a game can change ratings."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Iterable, Literal

Result = Literal["W", "L", "T", "C", "unknown"]

# Team A's score for the rating math. A win is a full point, a tie is half a
# point, and a loss is no points.
_ACTUAL_SCORES: dict[str, float] = {"W": 1.0, "T": 0.5, "L": 0.0}

# A forfeit gives a result, but no team played for it. The warehouse writes one
# of these notes on such a game.
_FORFEIT_NOTES = frozenset({"forfeit", "double forfeit"})


@dataclass(frozen=True, slots=True)
class Game:
    game_key: str
    season: int
    game_date: date
    team_a_key: str
    team_a_name: str
    team_b_key: str
    team_b_name: str
    team_a_result: Result
    team_a_program_id: str | None = None
    team_b_program_id: str | None = None
    team_a_division: int | None = None
    team_b_division: int | None = None
    is_team_a_home: bool = False
    is_team_b_home: bool = False
    team_a_score: int | None = None
    team_b_score: int | None = None
    notes: str | None = None

    @property
    def is_forfeit(self) -> bool:
        """Tell if one team or both teams gave up the game."""
        return (self.notes or "").strip().lower() in _FORFEIT_NOTES

    @property
    def is_canceled(self) -> bool:
        """Tell if the game will never be played."""
        return self.team_a_result == "C"

    @property
    def is_scheduled(self) -> bool:
        """Tell if the game has no result yet."""
        return self.team_a_result == "unknown"

    @property
    def rateable_score(self) -> float | None:
        """Give team A's score, or None if the game must not change a rating.

        This is the one rule for which games count. A forfeit gives None,
        because no team played the game. A canceled game and a game with no
        result also give None.
        """
        if self.is_forfeit:
            return None
        return _ACTUAL_SCORES.get(self.team_a_result)

    @property
    def is_rateable(self) -> bool:
        """Tell if the game can change a rating."""
        return self.rateable_score is not None


def chronological(games: Iterable[Game]) -> tuple[Game, ...]:
    """Put games in the order they occur.

    The season comes first in the sort key. A season must be complete before
    the next season starts, because a rating carries forward between seasons.
    """
    return tuple(
        sorted(games, key=lambda game: (game.season, game.game_date, game.game_key))
    )
