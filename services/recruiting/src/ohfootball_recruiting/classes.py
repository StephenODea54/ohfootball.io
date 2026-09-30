"""The recruiting classes that are still in high school.

All games of the Ohio season of the year Y are played from August to early December of Y. The
class of Y leaves high school in the spring of Y, so it played its last game in the season of
Y - 1. The seniors of the season of Y are thus the class of Y + 1. On any date in the year Y, the
classes Y + 1, Y + 2 and Y + 3 are the seniors, the juniors and the sophomores of that season.
Signing day needs no special rule, because the class of the current year is never read.
"""

from __future__ import annotations

from datetime import date

# Seniors, juniors and sophomores. Few freshmen have a rating.
CLASSES_ON_THE_FIELD = 3


def season_of(day: date) -> int:
    """Gives the season of a date. The season is the calendar year."""
    return day.year


def classes_on_the_field(season: int) -> tuple[int, ...]:
    """Gives the classes that play in a season, from the seniors to the sophomores."""
    return tuple(season + offset for offset in range(1, CLASSES_ON_THE_FIELD + 1))
