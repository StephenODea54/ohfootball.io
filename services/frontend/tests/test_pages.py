"""Checks the target that makes the output of the build ready for Cloudflare Pages.

The workflow that publishes the site runs this target after the build and before the upload. A
check that fails stops the upload, and Pages keeps the site it served before. A check that passes
when it should not publishes a site that sends each page through a redirect, that answers an
unknown address with the home page, or that tells a browser where the API is.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SITE_DIRECTORY = Path(__file__).resolve().parent.parent
SITE = SITE_DIRECTORY / "Makefile"
HEADERS = SITE_DIRECTORY / "public" / "_headers"

HOME = "<!DOCTYPE html><html><body>home<script src=/assets/main.js></script></body></html>"
NOT_FOUND = "<!DOCTYPE html><html><body>Page Not Found</body></html>"
KEY = "probe-key-123456"


def build(directory: Path, *pages: str) -> Path:
    """Writes the files a build writes: the home page, the not-found page, a script, the headers."""
    output = directory / "dist"
    (output / "assets").mkdir(parents=True)
    (output / "assets" / "main-abc123.js").write_text("console.log(1)")
    (output / "_headers").write_text(HEADERS.read_text())
    (output / "index.html").write_text(HOME)
    (output / "404.html").write_text(NOT_FOUND)
    for page in pages:
        path = output / page
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"<html>{page}</html>")
    return output


def pages(output: Path, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    """Runs the target. A key set in the shell that runs the tests does not reach it."""
    if env is None:
        env = {name: value for name, value in os.environ.items() if name != "GRAPHQL_API_KEY"}
    return subprocess.run(
        ["make", "-f", str(SITE), "pages", f"OUTPUT={output}"],
        capture_output=True,
        text=True,
        cwd=SITE_DIRECTORY,
        env=env,
    )


def with_key() -> dict[str, str]:
    return {**os.environ, "GRAPHQL_API_KEY": KEY}


class TheOutputOfTheBuild(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)

    def test_keeps_the_not_found_page_of_the_build(self) -> None:
        output = build(self.directory, "leaderboard.html", "teams/abc.html")

        finished = pages(output)

        self.assertEqual(finished.returncode, 0, finished.stderr)
        self.assertEqual((output / "404.html").read_text(), NOT_FOUND)
        self.assertIn("3 pages", finished.stdout)

    def test_answers_a_missing_asset_without_the_application(self) -> None:
        output = build(self.directory, "leaderboard.html")

        finished = pages(output)

        self.assertEqual(finished.returncode, 0, finished.stderr)
        self.assertEqual((output / "assets" / "404.html").read_text(), "Not found\n")

    def test_can_be_made_ready_twice(self) -> None:
        output = build(self.directory, "leaderboard.html")

        pages(output)
        finished = pages(output)

        self.assertEqual(finished.returncode, 0, finished.stderr)
        self.assertIn("2 pages", finished.stdout)

    def test_fails_when_the_build_wrote_no_pages(self) -> None:
        output = build(self.directory)
        (output / "index.html").unlink()

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("wrote no pages", finished.stderr)
        self.assertFalse((output / "assets" / "404.html").exists())

    def test_fails_when_the_build_wrote_no_assets(self) -> None:
        output = build(self.directory)
        (output / "assets" / "main-abc123.js").unlink()
        (output / "assets").rmdir()

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("no assets", finished.stderr)

    def test_fails_when_the_headers_are_missing(self) -> None:
        output = build(self.directory)
        (output / "_headers").unlink()

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("_headers is missing", finished.stderr)

    def test_fails_when_a_page_is_a_directory(self) -> None:
        # Pages would send /leaderboard to /leaderboard/ with a 308.
        output = build(self.directory, "leaderboard/index.html")

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("leaderboard/index.html", finished.stderr)
        self.assertIn("build.format", finished.stderr)
        self.assertFalse((output / "assets" / "404.html").exists())

    def test_fails_when_the_build_wrote_no_not_found_page(self) -> None:
        output = build(self.directory)
        (output / "404.html").unlink()

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("no 404.html", finished.stderr)
        self.assertFalse((output / "assets" / "404.html").exists())

    def test_fails_when_the_not_found_page_is_a_copy_of_the_home_page(self) -> None:
        # Pages would answer every unknown address with the home page and the status 404.
        output = build(self.directory)
        (output / "404.html").write_text(HOME)

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("copy of the home page", finished.stderr)

    def test_fails_when_a_page_names_the_api(self) -> None:
        output = build(self.directory, "leaderboard.html")
        (output / "leaderboard.html").write_text(
            '<html><script>fetch("https://api.ohfootball.io/graphql")</script></html>'
        )

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("leaderboard.html", finished.stderr)
        self.assertIn("name the API", finished.stderr)

    def test_fails_when_a_script_names_the_api(self) -> None:
        output = build(self.directory)
        (output / "assets" / "x.js").write_text('const url = "/GraphQL"')

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("assets/x.js", finished.stderr)

    def test_fails_when_a_file_holds_the_key(self) -> None:
        output = build(self.directory)
        (output / "assets" / "main-abc123.js").write_text(f'const key = "{KEY}"')

        finished = pages(output, with_key())

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("main-abc123.js", finished.stderr)
        self.assertNotIn(KEY, finished.stderr)
        self.assertNotIn(KEY, finished.stdout)

    def test_passes_with_a_key_that_no_file_holds(self) -> None:
        output = build(self.directory, "leaderboard.html")

        finished = pages(output, with_key())

        self.assertEqual(finished.returncode, 0, finished.stderr)

    def test_passes_with_no_key_set(self) -> None:
        output = build(self.directory, "leaderboard.html")
        (output / "assets" / "main-abc123.js").write_text(f'const key = "{KEY}"')

        finished = pages(output)

        self.assertEqual(finished.returncode, 0, finished.stderr)


def rules(text: str) -> dict[str, list[tuple[str, str]]]:
    """Reads the rules of a _headers file the way Pages does: an address, then indented headers."""
    found: dict[str, list[tuple[str, str]]] = {}
    address = ""
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line[0].isspace():
            name, _, value = line.strip().partition(":")
            found[address].append((name.strip(), value.strip()))
        else:
            address = line.strip()
            found[address] = []
    return found


class TheHeaders(unittest.TestCase):
    def setUp(self) -> None:
        self.rules = rules(HEADERS.read_text())

    def test_let_a_browser_keep_an_asset_for_a_year(self) -> None:
        self.assertIn(
            ("Cache-Control", "public, max-age=31536000, immutable"), self.rules["/assets/*"]
        )

    def test_set_the_cache_of_a_file_in_one_rule_only(self) -> None:
        # Pages joins the values of a header that two matching rules set. An asset that matched a
        # second rule with Cache-Control would be sent both values.
        setting = [
            address
            for address, headers in self.rules.items()
            for name, _ in headers
            if name.lower() == "cache-control"
        ]
        self.assertEqual(setting, ["/assets/*"])

    def test_keep_the_address_of_the_project_out_of_search_engines(self) -> None:
        self.assertIn(("X-Robots-Tag", "noindex"), self.rules["https://:project.pages.dev/*"])

    def test_keep_the_not_found_page_out_of_search_engines(self) -> None:
        # Pages also serves 404.html at /404, with the status 200.
        self.assertIn(("X-Robots-Tag", "noindex"), self.rules["/404"])


if __name__ == "__main__":
    unittest.main()
