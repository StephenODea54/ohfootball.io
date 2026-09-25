"""Applies every migration that the warehouse does not hold yet.

sustained refuses to apply a statement that removes data until a rehearsal proves it. A rehearsal
runs every pending migration on the warehouse in one transaction and then rolls the transaction
back. This script therefore runs the rehearsal first and applies the migrations after it. When
nothing is pending, both steps do nothing and succeed.

The host restarts a container that stops. With --hold, the script stays up after a run that
worked, until the host tells it to stop. A run that fails stops the container with the exit code
of sustained, and each restart writes the failure to the log again.
"""

from __future__ import annotations

import argparse
import signal
import sys
from collections.abc import Callable, Sequence

Run = Callable[[Sequence[str]], int]

STEPS = (["rehearse"], ["migrate"])


def apply(run: Run) -> int:
    """Runs each step in order and stops at the first step that fails."""
    for step in STEPS:
        code = run(step)
        if code != 0:
            return code
    return 0


def stop(signal_number: int, frame: object) -> None:
    """Stops the script with success. A stop signal is the normal end of a held container."""
    raise SystemExit(0)


def hold() -> None:
    """Waits for a stop signal.

    The script is process 1 in its container. Process 1 ignores a signal that has no handler, so
    without these handlers the host would wait the full stop period and then kill the container.
    """
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    while True:
        signal.pause()


def main(arguments: Sequence[str], run: Run | None = None) -> int:
    parser = argparse.ArgumentParser(description="Applies every pending migration.")
    parser.add_argument(
        "--hold",
        action="store_true",
        help="stay up after a run that worked, until a stop signal",
    )
    options = parser.parse_args(arguments)
    if run is None:
        from sustained.cli import main as run
    code = apply(run)
    if code == 0 and options.hold:
        hold()
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
