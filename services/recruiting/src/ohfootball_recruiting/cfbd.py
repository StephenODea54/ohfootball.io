"""Reads one recruiting class of Ohio from the API of CollegeFootballData.

The free key allows 1,000 calls a month, and the key stops working when a month goes over. Thus
each class costs exactly one request, and no request is tried again. The opener does not follow a
redirect, because a redirect is a second request and it would send the key to the new address.

The key goes in a header, so the address of a request never holds it. No message of this module
names it, and an error of this module carries no earlier exception that could hold the request.
The key is still an argument of fetch_class, so a tool that prints the local values of a stack
frame can show it. Do not turn on such a tool for this package.
"""

from __future__ import annotations

import http.client
import json
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

DEFAULT_API_URL = "https://api.collegefootballdata.com"
PATH = "/recruiting/players"
CLASSIFICATION = "HighSchool"
STATE = "OH"
# The header that tells how many calls are left in the month.
REMAINING_HEADER = "x-calllimit-remaining"
USER_AGENT = "ohfootball.io recruiting snapshot (hey@ohfootball.io)"
# The longest wait for one step of the connection or for one read. It is not a limit on the full
# request, so a server that sends one byte at a time can hold the request for longer.
TIMEOUT_SECONDS = 30

Opener = Callable[..., Any]


class FetchError(Exception):
    """The API did not give a class. The message tells why, and it never holds the key."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Refuses every redirect. urllib then raises the status of the redirect as an error."""

    def redirect_request(self, *arguments: object) -> None:
        return None


def default_opener() -> Opener:
    """Gives the opener of the real API: urllib with the proxy settings of the environment, and
    without redirects."""
    return urllib.request.build_opener(NoRedirect()).open


@dataclass(frozen=True, slots=True)
class Answer:
    url: str
    records: list[dict[str, Any]]
    calls_remaining: int | None


def request_url(api_url: str, class_year: int) -> str:
    """Gives the address that asks for the Ohio high-school recruits of one class."""
    query = urllib.parse.urlencode(
        {"year": class_year, "classification": CLASSIFICATION, "state": STATE}
    )
    return f"{api_url.rstrip('/')}{PATH}?{query}"


def fetch_class(
    class_year: int,
    *,
    api_key: str,
    api_url: str = DEFAULT_API_URL,
    opener: Opener | None = None,
) -> Answer:
    """Asks the API for one class, one time."""
    url = request_url(api_url, class_year)
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    # Each error is raised after its except block, so it carries no earlier exception.
    failure = None
    try:
        with (opener or default_opener())(request, timeout=TIMEOUT_SECONDS) as response:
            status = response.status
            body = response.read()
            remaining = calls_remaining(response.headers.get(REMAINING_HEADER))
    except urllib.error.HTTPError as error:
        error.close()
        failure = f"CollegeFootballData answered {error.code} for class {class_year}"
    except (urllib.error.URLError, http.client.HTTPException, OSError) as error:
        reason = getattr(error, "reason", error)
        failure = f"CollegeFootballData could not be reached for class {class_year}: {reason}"
    if failure is None and status != 200:
        failure = f"CollegeFootballData answered {status} for class {class_year}"
    if failure is None:
        records, failure = _records(body, class_year)
    if failure is not None:
        raise FetchError(failure)
    return Answer(url=url, records=records, calls_remaining=remaining)


def calls_remaining(header: str | None) -> int | None:
    """Reads the number of calls left. A missing value or a value that is not a whole number
    gives None."""
    if header is None:
        return None
    value = header.strip()
    return int(value) if value.isascii() and value.isdigit() and len(value) <= 18 else None


def _records(body: bytes, class_year: int) -> tuple[list[dict[str, Any]], str | None]:
    """Reads the records of an answer, or gives the reason that they cannot be read.

    JSON can hold NaN and Infinity, but the JSON type of PostgreSQL refuses them, so an answer
    that holds one is refused here.
    """
    try:
        records = json.loads(body, parse_constant=_refuse_constant)
    except ValueError:
        return [], f"CollegeFootballData gave an answer that is not JSON for class {class_year}"
    if not isinstance(records, list) or not all(isinstance(item, dict) for item in records):
        return [], (
            f"CollegeFootballData gave an answer that is not a list of records for class "
            f"{class_year}"
        )
    return records, None


def _refuse_constant(name: str) -> None:
    raise ValueError(f"the constant {name} is not allowed")
