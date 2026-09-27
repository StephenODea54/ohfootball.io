"""Checks the target that asks GitHub to build the site.

The target is the only step of the weekly run that talks to GitHub rather than to the warehouse.
A refusal by GitHub has to stop the run, because a silent refusal would leave the site drawn from
the ratings of the week before with nothing said about it.
"""

from __future__ import annotations

import http.server
import json
import os
import shutil
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path

PIPELINE_DIRECTORY = Path(__file__).resolve().parent.parent
PIPELINE = PIPELINE_DIRECTORY / "Makefile"

# A value that looks like a fine-grained token. No test output may hold it.
TOKEN = "github_pat_11TESTTOKEN0000000000_secretsecretsecret"

DISPATCH_PATH = "/repos/StephenODea54/ohfootball.io/actions/workflows/site.yml/dispatches"


class Answer(http.server.BaseHTTPRequestHandler):
    """Answers every request with one status. The status is set on the subclass.

    Each request is kept on the server, so a test can read the path, the headers and the body it
    was sent.
    """

    status = 200

    def do_POST(self) -> None:  # noqa: N802 - the name is fixed by the base class
        length = int(self.headers.get("Content-Length", "0"))
        self.server.requests.append((self.path, self.headers, self.rfile.read(length)))
        self.send_response(self.status)
        self.end_headers()

    def log_message(self, *arguments: object) -> None:
        """Keeps the test output clean."""


class GitHub:
    """A stand-in for the REST API of GitHub that answers one status, on a port the operating
    system picks."""

    def __init__(self, status: int) -> None:
        handler = type("Handler", (Answer,), {"status": status})
        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.server.requests = []
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self) -> str:
        self.thread.start()
        host, port = self.server.server_address[:2]
        return f"http://{host}:{port}"

    def __exit__(self, *details: object) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)


def publish_site(
    api: str,
    *settings: str,
    token: str | None = TOKEN,
    dry_run: bool = False,
    path: str | None = None,
) -> subprocess.CompletedProcess[str]:
    """Runs the target the way the host does, with the token in the environment."""
    command = ["make", "-f", str(PIPELINE), "publish-site", f"GITHUB_API_URL={api}", *settings]
    if dry_run:
        command.insert(1, "--dry-run")
    environment = {key: value for key, value in os.environ.items() if not key.startswith("SITE_")}
    if token is not None:
        environment["SITE_WORKFLOW_TOKEN"] = token
    if path is not None:
        environment["PATH"] = path
    return subprocess.run(
        command, capture_output=True, text=True, cwd=PIPELINE_DIRECTORY, env=environment
    )


class TheRequestToBuildTheSite(unittest.TestCase):
    def assertTokenHidden(self, finished: subprocess.CompletedProcess[str]) -> None:  # noqa: N802
        self.assertNotIn(TOKEN, finished.stdout)
        self.assertNotIn(TOKEN, finished.stderr)

    def test_is_finished_when_github_accepts_it(self) -> None:
        # The API version that the target asks for answers 200 with the ID of the new run.
        with GitHub(200) as api:
            finished = publish_site(api)

        self.assertEqual(finished.returncode, 0, finished.stderr)
        self.assertIn("200", finished.stdout)
        self.assertTokenHidden(finished)

    def test_is_finished_when_github_answers_without_content(self) -> None:
        # The earlier API version answers 204 with no body.
        with GitHub(204) as api:
            finished = publish_site(api)

        self.assertEqual(finished.returncode, 0, finished.stderr)

    def test_starts_the_site_workflow_on_main(self) -> None:
        github = GitHub(200)
        with github as api:
            finished = publish_site(api)

        self.assertEqual(finished.returncode, 0, finished.stderr)
        [(path, headers, body)] = github.server.requests
        self.assertEqual(path, DISPATCH_PATH)
        self.assertEqual(headers["Authorization"], f"Bearer {TOKEN}")
        self.assertEqual(headers["Accept"], "application/vnd.github+json")
        self.assertEqual(headers["X-GitHub-Api-Version"], "2026-03-10")
        self.assertEqual(headers["Content-Type"], "application/json")
        self.assertEqual(json.loads(body), {"ref": "main"})

    def test_names_the_repository_the_workflow_and_the_branch_it_is_given(self) -> None:
        github = GitHub(200)
        with github as api:
            finished = publish_site(
                api,
                "SITE_REPOSITORY=someone/fork",
                "SITE_WORKFLOW=other.yml",
                "SITE_BRANCH=release",
            )

        self.assertEqual(finished.returncode, 0, finished.stderr)
        [(path, _, body)] = github.server.requests
        self.assertEqual(path, "/repos/someone/fork/actions/workflows/other.yml/dispatches")
        self.assertEqual(json.loads(body), {"ref": "release"})

    def test_fails_when_github_refuses_the_token(self) -> None:
        with GitHub(401) as api:
            finished = publish_site(api)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("401", finished.stderr)
        self.assertIn("expired", finished.stderr)
        self.assertTokenHidden(finished)

    def test_fails_when_the_token_does_not_have_the_permission(self) -> None:
        with GitHub(403) as api:
            finished = publish_site(api)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("403", finished.stderr)
        self.assertTokenHidden(finished)

    def test_fails_when_github_does_not_know_the_workflow(self) -> None:
        with GitHub(404) as api:
            finished = publish_site(api)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("404", finished.stderr)
        self.assertIn("site.yml", finished.stderr)
        self.assertTokenHidden(finished)

    def test_fails_when_the_workflow_cannot_be_started_by_hand(self) -> None:
        with GitHub(422) as api:
            finished = publish_site(api)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("422", finished.stderr)
        self.assertIn("workflow_dispatch", finished.stderr)
        self.assertTokenHidden(finished)

    def test_fails_when_github_answers_with_a_redirect(self) -> None:
        # A redirect is not followed, because GitHub names a moved repository this way and the
        # setting has to change.
        with GitHub(301) as api:
            finished = publish_site(api)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("301", finished.stderr)

    def test_fails_when_github_has_an_error(self) -> None:
        with GitHub(500) as api:
            finished = publish_site(api)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("500", finished.stderr)

    def test_fails_when_nothing_answers(self) -> None:
        # The port is bound and then released, so nothing is listening on it.
        with GitHub(200) as api:
            pass
        finished = publish_site(api)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("did not reach GitHub", finished.stderr)
        self.assertTokenHidden(finished)

    def test_fails_when_the_name_of_github_does_not_resolve(self) -> None:
        # A name under .invalid never resolves, so curl stops before it connects.
        finished = publish_site("http://github.invalid")

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("did not reach GitHub", finished.stderr)
        self.assertTokenHidden(finished)

    def test_fails_when_no_token_is_set(self) -> None:
        with GitHub(200) as api:
            finished = publish_site(api, token=None)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("SITE_WORKFLOW_TOKEN is required", finished.stderr)

    def test_fails_when_the_token_is_empty(self) -> None:
        github = GitHub(200)
        with github as api:
            finished = publish_site(api, token="")

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("SITE_WORKFLOW_TOKEN is required", finished.stderr)
        self.assertEqual(github.server.requests, [])

    def test_keeps_the_token_out_of_the_commands_make_prints(self) -> None:
        # make prints each command in full with --dry-run. The token must not be part of a
        # command, or it would also be in the list of processes on the host.
        finished = publish_site("http://127.0.0.1:9", dry_run=True)

        self.assertEqual(finished.returncode, 0, finished.stderr)
        self.assertIn("SITE_WORKFLOW_TOKEN", finished.stdout)
        self.assertTokenHidden(finished)

    def test_keeps_the_token_out_of_the_arguments_of_curl(self) -> None:
        # Any user of the host can read the arguments of a running process. A curl on the PATH
        # before the real one writes down the arguments it was given and then runs the real one.
        real_curl = shutil.which("curl")
        with tempfile.TemporaryDirectory() as directory:
            arguments = Path(directory) / "arguments"
            recorder = Path(directory) / "curl"
            recorder.write_text(
                f'#!/bin/sh\nprintf "%s\\n" "$@" >> "{arguments}"\nexec "{real_curl}" "$@"\n'
            )
            recorder.chmod(0o755)
            with GitHub(200) as api:
                finished = publish_site(api, path=f"{directory}{os.pathsep}{os.environ['PATH']}")

            self.assertEqual(finished.returncode, 0, finished.stderr)
            self.assertIn("--header", arguments.read_text())
            self.assertNotIn(TOKEN, arguments.read_text())


if __name__ == "__main__":
    unittest.main()
