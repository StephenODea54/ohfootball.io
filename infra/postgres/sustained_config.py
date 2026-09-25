"""Tells sustained where the migrations are and how to connect to the warehouse.

sustained imports this module from the directory it runs in. The image of the migrations holds
this file and the migrations directory side by side in /app, and the compose file mounts this
directory at the same path.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path

migrations_dir = Path(__file__).resolve().parent / "migrations"
dialect = "postgres"


def database_url(environment: Mapping[str, str] = os.environ) -> str:
    """Returns the connection string of the warehouse from DATABASE_URL.

    The error does not show the value, because the value holds a password.
    """
    url = environment.get("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError(
            "DATABASE_URL is required. It is the connection string of the warehouse, for "
            "example postgresql://user:password@host:5432/ohfootball."
        )
    return url


def get_connection() -> object:
    """Opens the connection that sustained runs every command on."""
    import psycopg

    return psycopg.connect(database_url())
