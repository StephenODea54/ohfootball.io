"""Publishing the exported files to Kaggle as one dataset with a version per run.

Kaggle has two calls for this. One creates a dataset that does not exist yet, and one adds a
version to a dataset that does. The task asks Kaggle which of the two it needs, so a run is the
same whether it is the first or the fiftieth and nothing has to be switched by hand.

Those two calls send the title, the subtitle, the description, the tags, and the descriptions of
the files and the columns. They do not send the expected update frequency or the sources. Only the
call that updates the metadata of a dataset sends those, so each run makes that call too, after
Kaggle has finished the new version.

The Kaggle client reads its credentials when it is built, and it raises if it finds none. It is
therefore built inside a function rather than when this module is read, so the command line and the
tests work on a machine that holds no credentials.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable

from .marts import MARTS, Mart

METADATA_FILE = "dataset-metadata.json"
TITLE = "Ohio High School Football: Games and Elo Ratings"
SUBTITLE = "Ohio high school football games, teams, and Elo ratings, updated weekly"
LICENSE = "CC0-1.0"

# Each keyword must be the name of a tag that Kaggle already has. Kaggle drops a name it does not
# know and reports it, and the run prints that report. "football" is not used, because on Kaggle
# that tag is association football.
KEYWORDS = ("american football", "sports", "united states")

EXPECTED_UPDATE_FREQUENCY = "weekly"

SOURCES = (
    "The games and the teams come from the Ohio high school football pages of Joe Eitel "
    "([joeeitel.com/hsfoot](https://joeeitel.com/hsfoot)). The seasons before those pages begin "
    "come from the Ohio Highschool Football Database ([ohhsfbdb.net](https://ohhsfbdb.net/)). "
    "[ohfootball.io](https://ohfootball.io) cleans the records, joins the two views of each game "
    "into one row, and calculates the Elo ratings. The code is on "
    "[GitHub](https://github.com/StephenODea54/ohfootball.io)."
)

WEBSITE = "https://ohfootball.io"
REPOSITORY = "https://github.com/StephenODea54/ohfootball.io"

_INTRODUCTION = """
The game record of Ohio high school football, the teams that played it, and an Elo rating for
every team in every season. Rebuilt and published once a week from the ohfootball.io warehouse.
""".strip()

_LINKS = f"""
Links:

- The website, with the ratings and predictions of the current season: [ohfootball.io]({WEBSITE})
- The code of the scraper, the warehouse, the model, and this dataset: [GitHub]({REPOSITORY})
- A wrong score or a missing school: [open an issue]({REPOSITORY}/issues)
""".strip()

_NOTES = """
Join `fct_games` to `dim_teams` on `team_key`, and to `dim_dates` on `game_date_key` = `date_key`.

A flag is written as 0 or 1. A key is a UUID written as text. A date is written as YYYY-MM-DD. An
empty field is a null.

The record covers games played by Ohio teams. An opponent from another state appears in
`dim_teams` with its own `state_code`, and the games against it are in `fct_games`, so a count of
games by state is not a count of Ohio teams.
""".strip()

# The limits that Kaggle puts on the metadata. The checks here stop a value outside them before a
# request is sent, with a message that names the limit.
NAME_LENGTH = range(6, 51)
SUBTITLE_LENGTH = range(20, 81)
UPDATE_FREQUENCIES = frozenset(
    {"not specified", "never", "annually", "quarterly", "monthly", "weekly", "daily", "hourly"}
)

# Kaggle answers a request for a dataset it does not hold with either of these, so either one
# means the dataset has still to be created.
_MISSING_STATUSES = frozenset({403, 404})

# Kaggle processes a new version after the upload. The metadata is updated when the version is
# ready. A version that is not ready in this time keeps the metadata it was uploaded with.
READY_TIMEOUT_SECONDS = 600.0
READY_POLL_SECONDS = 15.0
_READY = "ready"
_BROKEN = frozenset({"failed", "deleted"})


@dataclass(frozen=True, slots=True)
class Publication:
    """What a publication did.

    `action` is "created" or "versioned". `metadata` is "updated" when the metadata was updated
    after the upload, or "not ready" when Kaggle did not finish the version in time.
    `invalid_tags` holds the keywords that Kaggle did not know.
    """

    action: str
    metadata: str
    invalid_tags: tuple[str, ...] = ()


def validate_dataset_id(dataset_id: str) -> str:
    """Check that an identifier names an owner and a dataset, and return it."""
    parts = dataset_id.split("/") if dataset_id else []
    if len(parts) != 2 or not all(parts):
        raise ValueError(f"a dataset is named owner/slug, not {dataset_id!r}")
    if len(parts[1]) not in NAME_LENGTH:
        raise ValueError(f"Kaggle takes a slug of 6 to 50 characters, not {parts[1]!r}")
    return dataset_id


def dataset_description(marts: Iterable[Mart] = MARTS) -> str:
    """The description of the dataset, with one line for each published file."""
    files = "\n".join(f"- `{mart.file_name}`: {mart.description}" for mart in marts)
    return f"{_INTRODUCTION}\n\n{_LINKS}\n\nFiles:\n\n{files}\n\n{_NOTES}"


def resources(marts: Iterable[Mart] = MARTS) -> list[dict[str, Any]]:
    """The description of each file and of each of its columns, in the order of the columns.

    Kaggle matches the columns by their order, so every column is listed. A file or a column with
    no description is refused, because Kaggle counts each one that has none against the dataset.
    """
    listed = []
    for mart in marts:
        if not mart.description:
            raise ValueError(f"{mart.file_name} has no description")
        fields = []
        for column in mart.columns:
            if not column.description:
                raise ValueError(f"{mart.name}.{column.name} has no description")
            fields.append({"name": column.name, "description": column.description})
        listed.append(
            {"path": mart.file_name, "description": mart.description, "schema": {"fields": fields}}
        )
    return listed


def write_metadata(
    directory: str | Path,
    dataset_id: str,
    *,
    title: str = TITLE,
    subtitle: str = SUBTITLE,
    license_name: str = LICENSE,
    description: str | None = None,
    keywords: Iterable[str] = KEYWORDS,
    expected_update_frequency: str = EXPECTED_UPDATE_FREQUENCY,
    sources: str = SOURCES,
    marts: Iterable[Mart] = MARTS,
) -> Path:
    """Write the file that Kaggle reads all of the metadata from."""
    validate_dataset_id(dataset_id)
    if len(title) not in NAME_LENGTH:
        raise ValueError(f"Kaggle takes a title of 6 to 50 characters, not {len(title)}")
    if len(subtitle) not in SUBTITLE_LENGTH:
        raise ValueError(f"Kaggle takes a subtitle of 20 to 80 characters, not {len(subtitle)}")
    if expected_update_frequency not in UPDATE_FREQUENCIES:
        raise ValueError(f"Kaggle does not take the frequency {expected_update_frequency!r}")
    published = tuple(marts)
    body = {
        "id": dataset_id,
        "title": title,
        "subtitle": subtitle,
        "description": description if description is not None else dataset_description(published),
        "licenses": [{"name": license_name}],
        "keywords": list(keywords),
        "expectedUpdateFrequency": expected_update_frequency,
        "userSpecifiedSources": sources,
        "resources": resources(published),
    }
    path = Path(directory) / METADATA_FILE
    path.write_text(json.dumps(body, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def authenticated_api() -> Any:
    """Build the Kaggle client from KAGGLE_USERNAME and KAGGLE_KEY."""
    from kaggle.api.kaggle_api_extended import KaggleApi

    api = KaggleApi()
    api.authenticate()
    return api


def dataset_exists(api: Any, dataset_id: str) -> bool:
    """Ask Kaggle whether it already holds the dataset."""
    validate_dataset_id(dataset_id)
    try:
        api.dataset_status(dataset_id)
    except Exception as error:
        if _status_code(error) in _MISSING_STATUSES:
            return False
        raise
    return True


def publish(
    directory: str | Path,
    dataset_id: str,
    *,
    version_notes: str,
    api: Any | None = None,
    ready_timeout: float = READY_TIMEOUT_SECONDS,
    poll_interval: float = READY_POLL_SECONDS,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
) -> Publication:
    """Create the dataset or add a version to it, then update its metadata."""
    validate_dataset_id(dataset_id)
    folder = str(directory)
    client = api if api is not None else authenticated_api()

    if dataset_exists(client, dataset_id):
        action = "versioned"
        result = client.dataset_create_version(
            folder,
            version_notes=version_notes,
            convert_to_csv=False,
            dir_mode="skip",
        )
    else:
        action = "created"
        result = client.dataset_create_new(
            folder,
            public=True,
            convert_to_csv=False,
            dir_mode="skip",
        )
    _raise_for_error(result)
    invalid_tags = _invalid_tags(result)

    if not _wait_until_ready(client, dataset_id, ready_timeout, poll_interval, sleep, clock):
        return Publication(action, "not ready", invalid_tags)
    _update_metadata(client, dataset_id, folder)
    return Publication(action, "updated", invalid_tags)


def _wait_until_ready(
    api: Any,
    dataset_id: str,
    timeout: float,
    interval: float,
    sleep: Callable[[float], None],
    clock: Callable[[], float],
) -> bool:
    """Wait until Kaggle has processed the new version, and say whether it did in time.

    The files are already uploaded at this point, and a failed run is retried from the start, which
    uploads them again. A question about the status that fails is therefore asked again until the
    time runs out, rather than failing the run. A new dataset can also be missing for a short time
    after it is created.
    """
    deadline = clock() + timeout
    while True:
        try:
            status = str(api.dataset_status(dataset_id)).lower()
        except Exception:
            status = ""
        if status == _READY:
            return True
        if status in _BROKEN:
            raise RuntimeError(f"Kaggle did not process the new version: {status}")
        if clock() >= deadline:
            return False
        sleep(interval)


def _update_metadata(api: Any, dataset_id: str, folder: str) -> None:
    """Send the metadata file of the folder as the metadata of the dataset.

    The client prints the errors that Kaggle reports and then exits. The exit is turned into an
    error here, so the run reports what failed.
    """
    try:
        api.dataset_metadata_update(dataset_id, folder)
    except SystemExit as error:
        raise RuntimeError(f"Kaggle refused the metadata of {dataset_id}") from error


def _status_code(error: BaseException) -> int | None:
    """The HTTP status an error carries, if it carries one."""
    code = getattr(getattr(error, "response", None), "status_code", None)
    return code if isinstance(code, int) else None


def _invalid_tags(result: Any) -> tuple[str, ...]:
    """The keywords that Kaggle did not know, as it reports them in its answer."""
    tags = getattr(result, "invalid_tags", None) or getattr(result, "invalidTags", None)
    return tuple(str(tag) for tag in tags) if isinstance(tags, (list, tuple)) else ()


def _raise_for_error(result: Any) -> None:
    """Fail the run when Kaggle answers with an error rather than raising one.

    The client reports some refusals in the object it returns instead of by raising, and a run that
    read only the raised ones would report a publication that never happened.
    """
    error = getattr(result, "error", None)
    if error:
        raise RuntimeError(f"Kaggle refused the upload: {error}")
    status = getattr(result, "status", None)
    if isinstance(status, str) and status.lower() == "error":
        raise RuntimeError(f"Kaggle refused the upload: {result}")
