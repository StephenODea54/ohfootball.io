"""Checks the script that applies the migrations and holds the container up."""

from __future__ import annotations

import os
import signal
import sys
import types
import unittest
from unittest import mock

import migrate


class Sustained:
    """Records each command it is given and answers with the next exit code."""

    def __init__(self, *codes: int) -> None:
        self.codes = list(codes)
        self.commands: list[list[str]] = []

    def __call__(self, command: list[str]) -> int:
        self.commands.append(list(command))
        return self.codes.pop(0)


class TheRun(unittest.TestCase):
    def test_rehearses_and_then_applies(self) -> None:
        sustained = Sustained(0, 0)

        self.assertEqual(migrate.apply(sustained), 0)
        self.assertEqual(sustained.commands, [["rehearse"], ["migrate"]])

    def test_applies_nothing_when_the_rehearsal_fails(self) -> None:
        sustained = Sustained(1)

        self.assertEqual(migrate.apply(sustained), 1)
        self.assertEqual(sustained.commands, [["rehearse"]])

    def test_returns_the_exit_code_of_a_refused_migration(self) -> None:
        # sustained exits 4 when a statement that removes data has no rehearsal.
        sustained = Sustained(0, 4)

        self.assertEqual(migrate.apply(sustained), 4)


class TheScript(unittest.TestCase):
    def test_stops_after_the_run_without_hold(self) -> None:
        with mock.patch.object(migrate, "hold") as hold:
            code = migrate.main([], Sustained(0, 0))

        self.assertEqual(code, 0)
        hold.assert_not_called()

    def test_holds_after_a_run_that_worked(self) -> None:
        with mock.patch.object(migrate, "hold") as hold:
            code = migrate.main(["--hold"], Sustained(0, 0))

        self.assertEqual(code, 0)
        hold.assert_called_once_with()

    def test_does_not_hold_after_a_run_that_failed(self) -> None:
        with mock.patch.object(migrate, "hold") as hold:
            code = migrate.main(["--hold"], Sustained(1))

        self.assertEqual(code, 1)
        hold.assert_not_called()

    def test_refuses_an_unknown_argument(self) -> None:
        with mock.patch("sys.stderr"), self.assertRaises(SystemExit) as stopped:
            migrate.main(["--hodl"], Sustained())

        self.assertEqual(stopped.exception.code, 2)

    def test_runs_the_sustained_command_line_by_default(self) -> None:
        cli = types.ModuleType("sustained.cli")
        cli.main = Sustained(0, 0)
        package = types.ModuleType("sustained")
        package.cli = cli
        modules = {"sustained": package, "sustained.cli": cli}

        with mock.patch.dict(sys.modules, modules):
            self.assertEqual(migrate.main([]), 0)

        self.assertEqual(cli.main.commands, [["rehearse"], ["migrate"]])


class TheHold(unittest.TestCase):
    def setUp(self) -> None:
        for number in (signal.SIGTERM, signal.SIGINT):
            self.addCleanup(signal.signal, number, signal.getsignal(number))

    def hold_until(self, number: int) -> SystemExit:
        def pause() -> None:
            os.kill(os.getpid(), number)

        with mock.patch("signal.pause", side_effect=pause):
            with self.assertRaises(SystemExit) as stopped:
                migrate.hold()
        return stopped.exception

    def test_ends_with_success_on_a_stop_signal(self) -> None:
        self.assertEqual(self.hold_until(signal.SIGTERM).code, 0)

    def test_ends_with_success_on_an_interrupt(self) -> None:
        self.assertEqual(self.hold_until(signal.SIGINT).code, 0)

    def test_waits_again_when_a_pause_ends_without_a_stop(self) -> None:
        pauses = [None, SystemExit(0)]

        with mock.patch("signal.pause", side_effect=pauses) as pause:
            with self.assertRaises(SystemExit):
                migrate.hold()

        self.assertEqual(pause.call_count, 2)


if __name__ == "__main__":
    unittest.main()
