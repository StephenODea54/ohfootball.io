"""Checks the target that makes the output of the build ready for Cloudflare Pages.

The workflow that publishes the site runs this target after the build and before the upload. A
check that fails stops the upload, and Pages keeps the site it served before. A check that passes
when it should not publishes a site that sends each page through a redirect, that answers an
unknown address with the home page, or that tells a browser where the API is. Only the API page,
which tells people how to call the API, may name it. It can also publish a sitemap that sends
search engines to addresses that Pages does not serve, or that leaves pages out. And it can send
pages to the picks Function, or replace the Function with a worker.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SITE_DIRECTORY = Path(__file__).resolve().parent.parent
SITE = SITE_DIRECTORY / "Makefile"
HEADERS = SITE_DIRECTORY / "public" / "_headers"
ROUTES = SITE_DIRECTORY / "public" / "_routes.json"
ROBOTS = SITE_DIRECTORY / "public" / "robots.txt"

HOME = "<!DOCTYPE html><html><body>home<script src=/assets/main.js></script></body></html>"
NOT_FOUND = "<!DOCTYPE html><html><body>Page Not Found</body></html>"
KEY = "probe-key-123456"
API_PAGE = "<html><p>Send requests to https://api.ohfootball.io/graphql</p></html>"
SITE_ADDRESS = "https://ohfootball.io/"


def sitemap_index(output: Path, *files: str) -> None:
    """Writes the sitemap index the way the sitemap integration does, all on one line."""
    entries = "".join(f"<sitemap><loc>{file}</loc></sitemap>" for file in files)
    (output / "sitemap-index.xml").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?><sitemapindex>{entries}</sitemapindex>'
    )


def sitemap(output: Path, *addresses: str, name: str = "sitemap-0.xml", joint: str = "") -> None:
    """Writes a file of addresses. The integration writes it all on one line. A joint of white
    space writes it the way a tool that sets out XML for people would."""
    urls = "".join(
        f"<url>{joint}<loc>{joint}{address}{joint}</loc>{joint}</url>" for address in addresses
    )
    (output / name).write_text(f'<?xml version="1.0" encoding="UTF-8"?><urlset>{urls}</urlset>')


def build(directory: Path, *pages: str) -> Path:
    """Writes the files a build writes: the home page, the not-found page, a script, the headers,
    the routes of the Function, robots.txt, and a sitemap that lists the home page and each other
    page."""
    output = directory / "dist"
    (output / "assets").mkdir(parents=True)
    (output / "assets" / "main-abc123.js").write_text("console.log(1)")
    (output / "_headers").write_text(HEADERS.read_text())
    (output / "_routes.json").write_text(ROUTES.read_text())
    (output / "robots.txt").write_text(ROBOTS.read_text())
    (output / "index.html").write_text(HOME)
    (output / "404.html").write_text(NOT_FOUND)
    for page in pages:
        path = output / page
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"<html>{page}</html>")
    sitemap_index(output, f"{SITE_ADDRESS}sitemap-0.xml")
    sitemap(output, SITE_ADDRESS, *(SITE_ADDRESS + page.removesuffix(".html") for page in pages))
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

    def test_passes_with_the_history_files_beside_the_pages(self) -> None:
        output = build(self.directory, "leaderboard.html", "compare.html")
        (output / "programs").mkdir()
        (output / "programs" / "1624.json").write_text('{"sourceId":"1624","seasons":[]}')

        finished = pages(output)

        self.assertEqual(finished.returncode, 0, finished.stderr)
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

    def test_fails_when_the_routes_are_missing(self) -> None:
        output = build(self.directory)
        (output / "_routes.json").unlink()

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("_routes.json is missing", finished.stderr)
        self.assertFalse((output / "assets" / "404.html").exists())

    def test_fails_when_the_routes_send_more_than_the_picks_to_the_function(self) -> None:
        # Every page would wait for the Function and count toward its limits.
        for routes in (
            '{"version":1,"include":["/*"],"exclude":[]}',
            '{"version":1,"include":["/picks/*"],"exclude":["/picks/board"]}',
            '{"version":1,"include":["/picks/*","/api/*"],"exclude":[]}',
            "",
        ):
            with self.subTest(routes=routes):
                output = build(Path(tempfile.mkdtemp(dir=self.directory)))
                (output / "_routes.json").write_text(routes)

                finished = pages(output)

                self.assertNotEqual(finished.returncode, 0)
                self.assertIn("must send only /picks/* to the Function", finished.stderr)
                self.assertFalse((output / "assets" / "404.html").exists())

    def test_reads_the_routes_in_any_layout(self) -> None:
        output = build(self.directory)
        (output / "_routes.json").write_text(
            '{\n  "version": 1,\n  "include": [\n    "/picks/*"\n  ],\n  "exclude": []\n}\n'
        )

        finished = pages(output)

        self.assertEqual(finished.returncode, 0, finished.stderr)

    def test_fails_when_the_output_holds_a_functions_directory(self) -> None:
        output = build(self.directory)
        (output / "functions" / "picks").mkdir(parents=True)
        (output / "functions" / "picks" / "board.ts").write_text("export {}")

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("functions must not exist", finished.stderr)
        self.assertFalse((output / "assets" / "404.html").exists())

    def test_fails_when_the_output_holds_a_worker(self) -> None:
        # Pages would run the worker for every address, in place of the Function and the files.
        output = build(self.directory)
        (output / "_worker.js").write_text("export default {}")

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("_worker.js must not exist", finished.stderr)
        self.assertFalse((output / "assets" / "404.html").exists())

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

    def test_fails_when_a_script_names_the_host_of_the_api(self) -> None:
        output = build(self.directory)
        (output / "assets" / "x.js").write_text('fetch("https://API.ohfootball.io/")')

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("assets/x.js", finished.stderr)

    def test_lets_the_api_page_name_the_api(self) -> None:
        output = build(self.directory, "leaderboard.html", "api.html")
        (output / "api.html").write_text(API_PAGE)

        finished = pages(output)

        self.assertEqual(finished.returncode, 0, finished.stderr)
        self.assertIn("3 pages", finished.stdout)

    def test_fails_when_another_page_names_the_api_next_to_the_api_page(self) -> None:
        output = build(self.directory, "about.html", "api.html")
        (output / "api.html").write_text(API_PAGE)
        (output / "about.html").write_text(API_PAGE)

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("about.html", finished.stderr)
        self.assertNotIn("./api.html", finished.stderr.splitlines())

    def test_fails_when_a_page_in_a_directory_has_the_name_of_the_api_page(self) -> None:
        # Only the page at the root is the API page.
        output = build(self.directory, "teams/api.html")
        (output / "teams" / "api.html").write_text(API_PAGE)

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("teams/api.html", finished.stderr)

    def test_fails_when_an_asset_has_the_name_of_the_api_page(self) -> None:
        output = build(self.directory)
        (output / "assets" / "api.html").write_text(API_PAGE)

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("assets/api.html", finished.stderr)

    def test_takes_the_name_of_the_api_page_from_a_setting(self) -> None:
        output = build(self.directory, "developers.html")
        (output / "developers.html").write_text(API_PAGE)
        env = {name: value for name, value in os.environ.items() if name != "GRAPHQL_API_KEY"}

        finished = subprocess.run(
            ["make", "-f", str(SITE), "pages", f"OUTPUT={output}", "API_DOCS_PAGE=developers.html"],
            capture_output=True,
            text=True,
            cwd=SITE_DIRECTORY,
            env=env,
        )

        self.assertEqual(finished.returncode, 0, finished.stderr)

    def test_fails_when_the_api_page_holds_the_key(self) -> None:
        output = build(self.directory, "api.html")
        (output / "api.html").write_text(f"<html>{API_PAGE}<p>{KEY}</p></html>")

        finished = pages(output, with_key())

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("hold the API key", finished.stderr)
        self.assertIn("api.html", finished.stderr)
        self.assertNotIn(KEY, finished.stderr + finished.stdout)

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

    def test_refuses_a_short_key(self) -> None:
        output = build(self.directory, "leaderboard.html")

        finished = pages(output, {**os.environ, "GRAPHQL_API_KEY": "short-key"})

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("shorter than 16 characters", finished.stderr)
        self.assertNotIn("short-key", finished.stderr + finished.stdout)
        self.assertFalse((output / "assets" / "404.html").exists())

    def test_passes_with_an_empty_key(self) -> None:
        # The site workflow sets the variable from a secret, and an unset secret is empty.
        output = build(self.directory, "leaderboard.html")
        (output / "assets" / "main-abc123.js").write_text(f'const key = "{KEY}"')

        finished = pages(output, {**os.environ, "GRAPHQL_API_KEY": ""})

        self.assertEqual(finished.returncode, 0, finished.stderr)

    def test_passes_with_no_key_set(self) -> None:
        output = build(self.directory, "leaderboard.html")
        (output / "assets" / "main-abc123.js").write_text(f'const key = "{KEY}"')

        finished = pages(output)

        self.assertEqual(finished.returncode, 0, finished.stderr)

    def test_fails_when_robots_is_missing(self) -> None:
        output = build(self.directory)
        (output / "robots.txt").unlink()

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("robots.txt is missing", finished.stderr)
        self.assertFalse((output / "assets" / "404.html").exists())

    def test_fails_when_the_sitemap_is_missing(self) -> None:
        output = build(self.directory)
        (output / "sitemap-index.xml").unlink()

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("no sitemap-index.xml", finished.stderr)
        self.assertFalse((output / "assets" / "404.html").exists())

    def test_fails_when_robots_names_no_sitemap(self) -> None:
        output = build(self.directory)
        (output / "robots.txt").write_text("User-agent: *\nAllow: /\n")

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("does not name https://ohfootball.io/sitemap-index.xml", finished.stderr)
        self.assertFalse((output / "assets" / "404.html").exists())

    def test_fails_when_robots_names_a_sitemap_on_another_host(self) -> None:
        output = build(self.directory)
        (output / "robots.txt").write_text(
            "User-agent: *\nAllow: /\nSitemap: https://ohfootball.pages.dev/sitemap-index.xml\n"
        )

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("does not name", finished.stderr)

    def test_reads_robots_with_windows_line_ends(self) -> None:
        output = build(self.directory)
        (output / "robots.txt").write_text(ROBOTS.read_text().replace("\n", "\r\n"))

        finished = pages(output)

        self.assertEqual(finished.returncode, 0, finished.stderr)

    def test_fails_when_the_index_lists_no_file(self) -> None:
        output = build(self.directory)
        sitemap_index(output)

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("lists no file of addresses", finished.stderr)
        self.assertFalse((output / "assets" / "404.html").exists())

    def test_fails_when_the_index_lists_a_file_the_build_did_not_write(self) -> None:
        output = build(self.directory)
        sitemap_index(output, f"{SITE_ADDRESS}sitemap-0.xml", f"{SITE_ADDRESS}sitemap-1.xml")

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("lists sitemap-1.xml, and the build did not write it", finished.stderr)
        self.assertFalse((output / "assets" / "404.html").exists())

    def test_fails_when_the_index_lists_a_directory(self) -> None:
        output = build(self.directory)
        (output / "sitemap-0.xml").unlink()
        (output / "sitemap-0.xml").mkdir()

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("lists sitemap-0.xml, and the build did not write it", finished.stderr)

    def test_fails_when_the_index_lists_a_file_on_another_host(self) -> None:
        output = build(self.directory)
        sitemap_index(output, "https://other.example/sitemap-0.xml")

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("https://other.example/sitemap-0.xml, which is not on", finished.stderr)
        self.assertFalse((output / "assets" / "404.html").exists())

    def test_fails_when_the_sitemap_lists_an_address_with_html(self) -> None:
        output = build(self.directory, "leaderboard.html")
        sitemap(
            output,
            SITE_ADDRESS,
            f"{SITE_ADDRESS}leaderboard",
            f"{SITE_ADDRESS}leaderboard.html",
        )

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn(f"{SITE_ADDRESS}leaderboard.html", finished.stderr.splitlines())
        self.assertFalse((output / "assets" / "404.html").exists())

    def test_fails_when_the_sitemap_lists_a_directory(self) -> None:
        # Pages would send /teams/ to /teams with a redirect.
        output = build(self.directory, "teams.html")
        sitemap(output, SITE_ADDRESS, f"{SITE_ADDRESS}teams", f"{SITE_ADDRESS}teams/")

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn(f"{SITE_ADDRESS}teams/", finished.stderr.splitlines())
        self.assertFalse((output / "assets" / "404.html").exists())

    def test_fails_when_the_sitemap_lists_the_not_found_page(self) -> None:
        # 404.html exists, but the page tells search engines to leave it out.
        output = build(self.directory)
        sitemap(output, SITE_ADDRESS, f"{SITE_ADDRESS}404")

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn(f"{SITE_ADDRESS}404", finished.stderr.splitlines())
        self.assertFalse((output / "assets" / "404.html").exists())

    def test_fails_when_the_sitemap_lists_an_address_with_no_page(self) -> None:
        output = build(self.directory, "leaderboard.html")
        sitemap(output, SITE_ADDRESS, f"{SITE_ADDRESS}leaderboard", f"{SITE_ADDRESS}teams/gone")

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn(f"{SITE_ADDRESS}teams/gone", finished.stderr.splitlines())
        self.assertNotIn(f"{SITE_ADDRESS}leaderboard", finished.stderr.splitlines())
        self.assertFalse((output / "assets" / "404.html").exists())

    def test_fails_when_the_sitemap_lists_an_address_on_another_host(self) -> None:
        # Search engines would be sent to the copy of the site on pages.dev.
        output = build(self.directory, "leaderboard.html")
        sitemap(
            output,
            SITE_ADDRESS,
            f"{SITE_ADDRESS}leaderboard",
            "https://ohfootball.pages.dev/leaderboard",
        )

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("https://ohfootball.pages.dev/leaderboard", finished.stderr.splitlines())

    def test_fails_when_the_sitemap_leaves_out_a_page(self) -> None:
        output = build(self.directory, "leaderboard.html", "teams/abc.html")
        sitemap(output, SITE_ADDRESS, f"{SITE_ADDRESS}leaderboard")

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("does not list these pages", finished.stderr)
        self.assertIn("teams/abc.html", finished.stderr.splitlines())
        self.assertFalse((output / "assets" / "404.html").exists())

    def test_fails_when_the_sitemap_leaves_out_the_home_page(self) -> None:
        output = build(self.directory, "leaderboard.html")
        sitemap(output, f"{SITE_ADDRESS}leaderboard")

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn(".html", finished.stderr.splitlines())

    def test_fails_when_the_sitemap_lists_no_address(self) -> None:
        output = build(self.directory, "leaderboard.html")
        sitemap(output)

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn("does not list these pages", finished.stderr)

    def test_reads_an_address_split_over_lines(self) -> None:
        output = build(self.directory, "leaderboard.html")
        sitemap(
            output,
            SITE_ADDRESS,
            f"{SITE_ADDRESS}leaderboard",
            f"{SITE_ADDRESS}teams/gone",
            joint="\n  ",
        )

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn(f"{SITE_ADDRESS}teams/gone", finished.stderr.splitlines())

    def test_reads_every_file_that_the_index_lists(self) -> None:
        output = build(self.directory, "leaderboard.html")
        sitemap(output, f"{SITE_ADDRESS}teams/gone", name="sitemap-1.xml")
        sitemap_index(output, f"{SITE_ADDRESS}sitemap-0.xml", f"{SITE_ADDRESS}sitemap-1.xml")

        finished = pages(output)

        self.assertNotEqual(finished.returncode, 0)
        self.assertIn(f"{SITE_ADDRESS}teams/gone", finished.stderr.splitlines())

    def test_accepts_the_pages_of_the_build_over_more_than_one_file(self) -> None:
        output = build(self.directory, "leaderboard.html", "teams/abc.html")
        sitemap(output, SITE_ADDRESS, f"{SITE_ADDRESS}leaderboard")
        sitemap(output, f"{SITE_ADDRESS}teams/abc", name="sitemap-1.xml", joint="\n  ")
        sitemap_index(output, f"{SITE_ADDRESS}sitemap-0.xml", f"{SITE_ADDRESS}sitemap-1.xml")

        finished = pages(output)

        self.assertEqual(finished.returncode, 0, finished.stderr)
        self.assertIn("3 pages", finished.stdout)


class TheRoutes(unittest.TestCase):
    def test_send_only_the_picks_to_the_function(self) -> None:
        self.assertEqual(
            json.loads(ROUTES.read_text()),
            {"version": 1, "include": ["/picks/*"], "exclude": []},
        )


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

    def test_let_a_browser_keep_a_logo_for_a_week(self) -> None:
        self.assertIn(("Cache-Control", "public, max-age=604800"), self.rules["/logos/*"])

    def test_set_the_cache_of_a_file_in_one_rule_only(self) -> None:
        # Pages joins the values of a header that two matching rules set. An asset that matched a
        # second rule with Cache-Control would be sent both values. No address matches both
        # /assets/* and /logos/*.
        setting = [
            address
            for address, headers in self.rules.items()
            for name, _ in headers
            if name.lower() == "cache-control"
        ]
        self.assertEqual(setting, ["/assets/*", "/logos/*"])

    def test_keep_the_address_of_the_project_out_of_search_engines(self) -> None:
        self.assertIn(("X-Robots-Tag", "noindex"), self.rules["https://:project.pages.dev/*"])

    def test_keep_the_not_found_page_out_of_search_engines(self) -> None:
        # Pages also serves 404.html at /404, with the status 200.
        self.assertIn(("X-Robots-Tag", "noindex"), self.rules["/404"])


class TheRobotsFile(unittest.TestCase):
    def setUp(self) -> None:
        self.lines = [
            line.strip()
            for line in ROBOTS.read_text().splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        ]

    def test_lets_every_crawler_read_every_page(self) -> None:
        self.assertEqual(self.lines[:2], ["User-agent: *", "Allow: /"])

    def test_keeps_no_page_from_crawlers(self) -> None:
        # A crawler must read the not-found page to see that it is left out of search engines.
        self.assertFalse([line for line in self.lines if line.lower().startswith("disallow")])

    def test_names_the_sitemap_once(self) -> None:
        named = [line for line in self.lines if line.lower().startswith("sitemap:")]
        self.assertEqual(named, [f"Sitemap: {SITE_ADDRESS}sitemap-index.xml"])


if __name__ == "__main__":
    unittest.main()
