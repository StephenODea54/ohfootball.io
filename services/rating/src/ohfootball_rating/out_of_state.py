"""The state of a team, from its state code or from its name.

The rating knows a team from another state only from its games against Ohio teams. This module
tells which teams are Ohio teams.
"""

from __future__ import annotations

import re

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
