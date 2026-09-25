"""Checks the target that makes the output of the build ready for Cloudflare Pages.

The workflow that publishes the site runs this target after the build and before the upload. A
check that fails stops the upload, and Pages keeps the site it served before. A check that passes
when it should not publishes a site that sends each page through a redirect, or that answers a
team page of an earlier season with nothing.
"""

from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path

SITE_DIRECTORY = Path(__file__).resolve().parent.parent
SITE = SITE_DIRECTORY / "Makefile"
HEADERS = SITE_DIRECTORY / "public" / "_headers"

HOME = "<!DOCTYPE html><html><body>home<script src=/assets/main.js></script></body></html>"


def build(directory: Path, *pages: str) -> Path:
    """Writes the files a build writes, with the home page, one script and the headers."""
    output = directory / "public"
    (output / "assets").mkdir(parents=True)
    (output / "assets" / "main-abc123.js").write_text("console.log(1)")
    (output / "_headers").write_text(HEADERS.read_text())
    (output / "index.html").write_text(HOME)
    for page in pages:
        path = output / page
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"<html>{page}</html>")
    return output


def pages(output: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["make", "-f", str(SITE), "pages", f"OUTPUT={output}"],
        capture_output=True,
        text=True,
        cwd=SITE_DIRECTORY,
    )


class TheOutputOfTheBuild(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)

    def test_answers_an_unknown_address_with_the_application(self) -> None:
        output = build(self.directory, "leaderboard.html", "teams/abc.html")

        finished = pages(output)

        self.assertEqual(finished.returncode, 0, finished.stderr)
        self.assertEqual((output / "404.html").read_text(), HOME)
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
        self.assertFalse((output / "404.html").exists())

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
        self.assertIn("autoSubfolderIndex", finished.stderr)
        self.assertFalse((output / "404.html").exists())


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

    def test_keep_the_copy_of_the_home_page_out_of_search_engines(self) -> None:
        # Pages also serves 404.html at /404, with the status 200.
        self.assertIn(("X-Robots-Tag", "noindex"), self.rules["/404"])


if __name__ == "__main__":
    unittest.main()
