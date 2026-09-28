"""Publishing the exported files to Kaggle as one dataset with a version per run.

Kaggle has two calls for this. One creates a dataset that does not exist yet, and one adds a
version to a dataset that does. The task asks Kaggle which of the two it needs, so a run is the
same whether it is the first or the fiftieth and nothing has to be switched by hand.

The Kaggle client reads its credentials when it is built, and it raises if it finds none. It is
therefore built inside a function rather than when this module is read, so the command line and the
tests work on a machine that holds no credentials.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

METADATA_FILE = "dataset-metadata.json"
TITLE = "Ohio High School Football: Games and Elo Ratings"
LICENSE = "CC0-1.0"

DESCRIPTION = """
The game record of Ohio high school football, the teams that played it, and an Elo rating for
every team in every season. Rebuilt and published once a week from the ohfootball.io warehouse.

Files:

- `dim_teams.csv`: one row per team per season, with city, county, division, region, and colors.
- `dim_dates.csv`: the calendar the games are dated against.
- `fct_games.csv`: one row per game, with both scores, both results, and the home side.
- `fct_team_elo_ratings.csv`: the rating each team held at the end of each season.
- `fct_game_predictions.csv`: the rating both teams carried into a game, and the win probability
  read from those ratings before it was played.

Join `fct_games` to `dim_teams` on `team_key`, and to `dim_dates` on `game_date_key` = `date_key`.

A flag is written as 0 or 1. A key is a UUID written as text. A date is written as YYYY-MM-DD. An
empty field is a null.

The record covers games played by Ohio teams. An opponent from another state appears in
`dim_teams` with its own `state_code`, and the games against it are in `fct_games`, so a count of
games by state is not a count of Ohio teams.
""".strip()

# Kaggle refuses to create a dataset whose title or slug is shorter or longer than this. The checks
# here stop such a name before a request is sent, with a message that names the limit.
NAME_LENGTH = range(6, 51)

# Kaggle answers a request for a dataset it does not hold with either of these, so either one
# means the dataset has still to be created.
_MISSING_STATUSES = frozenset({403, 404})


def validate_dataset_id(dataset_id: str) -> str:
    """Check that an identifier names an owner and a dataset, and return it."""
    parts = dataset_id.split("/") if dataset_id else []
    if len(parts) != 2 or not all(parts):
        raise ValueError(f"a dataset is named owner/slug, not {dataset_id!r}")
    if len(parts[1]) not in NAME_LENGTH:
        raise ValueError(f"Kaggle takes a slug of 6 to 50 characters, not {parts[1]!r}")
    return dataset_id


def write_metadata(
    directory: str | Path,
    dataset_id: str,
    *,
    title: str = TITLE,
    license_name: str = LICENSE,
    description: str = DESCRIPTION,
) -> Path:
    """Write the file Kaggle reads the name, the license, and the description from."""
    validate_dataset_id(dataset_id)
    if len(title) not in NAME_LENGTH:
        raise ValueError(f"Kaggle takes a title of 6 to 50 characters, not {len(title)}")
    path = Path(directory) / METADATA_FILE
    body = {
        "id": dataset_id,
        "title": title,
        "description": description,
        "licenses": [{"name": license_name}],
    }
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
) -> str:
    """Create the dataset or add a version to it, and say which of the two happened."""
    validate_dataset_id(dataset_id)
    folder = str(directory)
    client = api if api is not None else authenticated_api()

    if dataset_exists(client, dataset_id):
        _raise_for_error(
            client.dataset_create_version(
                folder,
                version_notes=version_notes,
                convert_to_csv=False,
                dir_mode="skip",
            )
        )
        return "versioned"

    _raise_for_error(
        client.dataset_create_new(
            folder,
            public=True,
            convert_to_csv=False,
            dir_mode="skip",
        )
    )
    return "created"


def _status_code(error: BaseException) -> int | None:
    """The HTTP status an error carries, if it carries one."""
    code = getattr(getattr(error, "response", None), "status_code", None)
    return code if isinstance(code, int) else None


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
