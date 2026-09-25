"""Checks the target that asks the host to build the site.

The target is the only step of the weekly run that talks to the host rather than to the
warehouse. A refusal by the host has to stop the run, because a silent refusal would leave the
site drawn from the ratings of the week before with nothing said about it.
"""

from __future__ import annotations

import http.server
import json
import subprocess
import threading
import unittest
from pathlib import Path

PIPELINE_DIRECTORY = Path(__file__).resolve().parent.parent
PIPELINE = PIPELINE_DIRECTORY / "Makefile"


class Answer(http.server.BaseHTTPRequestHandler):
    """Answers every request with one status. The status is set on the subclass.

    Each request is kept on the server, so a test can read the headers and the body it was sent.
    """

    status = 200

    def do_POST(self) -> None:  # noqa: N802 - the name is fixed by the base class
        length = int(self.headers.get("Content-Length", "0"))
        self.server.requests.append((self.headers, self.rfile.read(length)))
        self.send_response(self.status)
        self.end_headers()

    def log_message(self, *arguments: object) -> None:
        """Keeps the test output clean."""


class Host:
    """A host that answers one status, on a port the operating system picks."""

    def __init__(self, status: int) -> None:
        handler = type("Handler", (Answer,), {"status": status})
        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.server.requests = []
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self) -> str:
        self.thread.start()
        host, port = self.server.server_address[:2]
        return f"http://{host}:{port}/deploy"

    def __exit__(self, *details: object) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)


def publish_site(webhook: str | None, *settings: str) -> subprocess.CompletedProcess[str]:
    command = ["make", "-f", str(PIPELINE), "publish-site", *settings]
    if webhook is not None:
        command.append(f"SITE_DEPLOY_WEBHOOK={webhook}")
    return subprocess.run(command, capture_output=True, text=True, cwd=PIPELINE_DIRECTORY)


class TheRequestToBuildTheSite(unittest.TestCase):
    def test_is_finished_when_the_host_accepts_it(self) -> None:
        with Host(200) as webhook:
            finished = publish_site(webhook)

        self.assertEqual(finished.returncode, 0, finished.stderr)
        self.assertIn("200", finished.stdout)

    def test_is_finished_when_the_host_accepts_it_without_content(self) -> None:
        with Host(204) as webhook:
            finished = publish_site(webhook)

        self.assertEqual(finished.returncode, 0, finished.stderr)

    def test_fails_when_the_host_refuses_it(self) -> None:
        with Host(500) as webhook:
            finished = publish_site(webhook)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("500", finished.stderr)

    def test_has_the_form_of_a_push_to_main(self) -> None:
        host = Host(200)
        with host as webhook:
            finished = publish_site(webhook)

        self.assertEqual(finished.returncode, 0, finished.stderr)
        [(headers, body)] = host.server.requests
        self.assertEqual(headers["X-GitHub-Event"], "push")
        self.assertEqual(headers["Content-Type"], "application/json")
        self.assertEqual(json.loads(body), {"ref": "refs/heads/main"})

    def test_names_the_branch_it_is_given(self) -> None:
        host = Host(200)
        with host as webhook:
            finished = publish_site(webhook, "SITE_BRANCH=release")

        self.assertEqual(finished.returncode, 0, finished.stderr)
        [(_, body)] = host.server.requests
        self.assertEqual(json.loads(body), {"ref": "refs/heads/release"})

    def test_fails_when_the_host_refuses_the_branch(self) -> None:
        # Dokploy answers 301 with no address to follow when the branch does not match.
        with Host(301) as webhook:
            finished = publish_site(webhook)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("301", finished.stderr)

    def test_fails_when_the_host_does_not_know_the_webhook(self) -> None:
        with Host(404) as webhook:
            finished = publish_site(webhook)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("404", finished.stderr)

    def test_fails_when_nothing_answers(self) -> None:
        # The port is bound and then released, so nothing is listening on it.
        with Host(200) as webhook:
            pass
        finished = publish_site(webhook)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("did not reach the host", finished.stderr)

    def test_fails_when_no_webhook_is_set(self) -> None:
        finished = publish_site("")

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("SITE_DEPLOY_WEBHOOK is required", finished.stderr)


if __name__ == "__main__":
    unittest.main()
