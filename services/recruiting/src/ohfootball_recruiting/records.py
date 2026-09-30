"""The typed columns of a recruit and a copy of the record that the warehouse accepts.

The warehouse keeps each record as JSON, and a few fields also go into typed columns for joins. A
field that is missing or that has a wrong type gives NULL in its column. The JSON copy keeps the
field as the API gave it.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

# The largest value of each integer type of PostgreSQL. A larger value gives NULL, so the write of
# the class does not fail.
BIGINT_MAX = 2**63 - 1
INTEGER_MAX = 2**31 - 1
SMALLINT_MAX = 2**15 - 1


@dataclass(frozen=True, slots=True)
class TypedFields:
    cfbd_id: int | None
    athlete_id: int | None
    name: str | None
    school: str | None
    city: str | None
    state_province: str | None
    position: str | None
    stars: int | None
    rating: float | None
    ranking: int | None
    committed_to: str | None


def typed_fields(record: Mapping[str, Any]) -> TypedFields:
    """Reads the typed columns of one recruit."""
    return TypedFields(
        cfbd_id=_whole(record.get("id"), BIGINT_MAX),
        athlete_id=_whole(record.get("athleteId"), BIGINT_MAX),
        name=_text(record.get("name")),
        school=_text(record.get("school")),
        city=_text(record.get("city")),
        state_province=_text(record.get("stateProvince")),
        position=_text(record.get("position")),
        stars=_whole(record.get("stars"), SMALLINT_MAX),
        rating=_number(record.get("rating")),
        ranking=_whole(record.get("ranking"), INTEGER_MAX),
        committed_to=_text(record.get("committedTo")),
    )


def without_nul(value: Any) -> Any:
    """Removes the NUL character from every text in a record.

    The JSON type of PostgreSQL refuses a text that holds NUL, so one such character would stop
    the write of a whole class. If two keys differ only by NUL, the last one is kept.
    """
    if isinstance(value, str):
        return value.replace("\x00", "")
    if isinstance(value, list):
        return [without_nul(item) for item in value]
    if isinstance(value, dict):
        return {without_nul(key): without_nul(item) for key, item in value.items()}
    return value


def _whole(value: Any, largest: int) -> int | None:
    """Reads a whole number from 0 to the largest value of its column.

    The API gives the ids as text, so a text of digits is accepted. A number such as 5.0 is
    accepted as 5.
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    if isinstance(value, str):
        text = value.strip()
        # A long text cannot fit any column, and int() refuses a text of more than 4,300 digits.
        if not (text.isascii() and text.isdigit() and len(text) <= 19):
            return None
        value = int(text)
    if isinstance(value, int) and 0 <= value <= largest:
        return value
    return None


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _text(value: Any) -> str | None:
    return without_nul(value) if isinstance(value, str) else None
