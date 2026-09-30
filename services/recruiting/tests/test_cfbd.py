import http.client
import http.server
import io
import json
import os
import threading
import traceback
import unittest
import urllib.error
import urllib.request
from email.message import Message
from unittest import mock

from ohfootball_recruiting.cfbd import (
    DEFAULT_API_URL,
    REMAINING_HEADER,
    USER_AGENT,
    Answer,
    FetchError,
    NoRedirect,
    calls_remaining,
    default_opener,
    fetch_class,
    request_url,
)

# A value that looks like a key. No message may hold it.
KEY = "cfbd-test-key-0000-secret"


class Response(io.BytesIO):
    """A stand-in for the answer that urlopen gives."""

    def __init__(
        self, body: bytes, headers: dict[str, str] | None = None, status: int = 200
    ) -> None:
        super().__init__(body)
        self.status = status
        self.headers = Message()
        for name, value in (headers or {}).items():
            self.headers[name] = value


class Opener:
    """Gives one answer or raises one error, and keeps each request it was sent."""

    def __init__(self, answer: Response | None = None, error: Exception | None = None) -> None:
        self.answer, self.error, self.requests = answer, error, []

    def __call__(self, request, timeout):
        self.requests.append((request, timeout))
        if self.error is not None:
            raise self.error
        return self.answer


def fetch(opener: Opener, class_year: int = 2027) -> Answer:
    return fetch_class(class_year, api_key=KEY, api_url="http://api.test", opener=opener)


class TheAddress(unittest.TestCase):
    def test_asks_for_the_ohio_high_school_recruits_of_one_class(self) -> None:
        self.assertEqual(
            request_url("http://api.test/", 2027),
            "http://api.test/recruiting/players?year=2027&classification=HighSchool&state=OH",
        )

    def test_is_the_real_api_by_default(self) -> None:
        self.assertEqual(DEFAULT_API_URL, "https://api.collegefootballdata.com")


class TheRequest(unittest.TestCase):
    def test_sends_the_key_in_a_header_and_not_in_the_address(self) -> None:
        opener = Opener(Response(b"[]"))
        answer = fetch(opener)

        request, timeout = opener.requests[0]
        self.assertEqual(request.get_header("Authorization"), f"Bearer {KEY}")
        self.assertEqual(request.get_header("Accept"), "application/json")
        self.assertEqual(request.get_header("User-agent"), USER_AGENT)
        self.assertNotIn(KEY, request.full_url)
        self.assertNotIn(KEY, answer.url)
        self.assertEqual(timeout, 30)

    def test_is_sent_one_time(self) -> None:
        opener = Opener(error=urllib.error.URLError("down"))
        with self.assertRaises(FetchError):
            fetch(opener)

        self.assertEqual(len(opener.requests), 1)


class TheAnswer(unittest.TestCase):
    def test_gives_the_records_and_the_calls_left(self) -> None:
        records = [{"id": "1", "name": "A"}, {"id": "2", "name": "B"}]
        answer = fetch(Opener(Response(json.dumps(records).encode(), {REMAINING_HEADER: "987"})))

        self.assertEqual(answer.records, records)
        self.assertEqual(answer.calls_remaining, 987)
        self.assertEqual(answer.url, request_url("http://api.test", 2027))

    def test_can_be_an_empty_class(self) -> None:
        self.assertEqual(fetch(Opener(Response(b"[]"))).records, [])

    def test_without_the_header_gives_no_count(self) -> None:
        self.assertIsNone(fetch(Opener(Response(b"[]"))).calls_remaining)


class TheErrors(unittest.TestCase):
    def assert_fails(self, opener: Opener, text: str) -> None:
        with self.assertRaises(FetchError) as caught:
            fetch(opener)
        error = caught.exception
        self.assertIn(text, str(error))
        self.assertIn("2027", str(error))
        self.assertIsNone(error.__cause__)
        self.assertIsNone(error.__context__)
        self.assertNotIn(KEY, "".join(traceback.format_exception(error)))

    def test_name_the_status_of_a_refusal(self) -> None:
        for status in (401, 403, 429, 500, 503):
            with self.subTest(status=status):
                error = urllib.error.HTTPError("http://api.test", status, "no", Message(), None)
                self.assert_fails(Opener(error=error), f"answered {status}")

    def test_name_a_network_fault(self) -> None:
        for error in (urllib.error.URLError("refused"), TimeoutError("slow"), OSError("reset")):
            with self.subTest(error=error):
                self.assert_fails(Opener(error=error), "could not be reached")

    def test_name_a_body_that_ends_too_soon(self) -> None:
        answer = Response(b"[")
        answer.read = mock.Mock(side_effect=http.client.IncompleteRead(b"[", 998))
        self.assert_fails(Opener(answer), "could not be reached")

    def test_name_a_success_status_that_is_not_200(self) -> None:
        self.assert_fails(Opener(Response(b"", status=204)), "answered 204")

    def test_refuse_an_answer_that_is_not_json(self) -> None:
        self.assert_fails(Opener(Response(b"<html>")), "not JSON")

    def test_refuse_json_that_holds_nan_or_infinity(self) -> None:
        for body in (b'[{"rating": NaN}]', b'[{"rating": Infinity}]', b'[{"rating": -Infinity}]'):
            with self.subTest(body=body):
                self.assert_fails(Opener(Response(body)), "not JSON")

    def test_refuse_json_that_is_not_a_list_of_records(self) -> None:
        for body in (b'{"id": 1}', b"[1, 2]", b"null"):
            with self.subTest(body=body):
                self.assert_fails(Opener(Response(body)), "not a list of records")


class TheCallsRemaining(unittest.TestCase):
    def test_read_a_whole_number(self) -> None:
        self.assertEqual(calls_remaining(" 42 "), 42)

    def test_are_unknown_for_a_value_that_is_not_a_whole_number(self) -> None:
        for header in (None, "", "abc", "-1", "1.5", "²"):
            with self.subTest(header=header):
                self.assertIsNone(calls_remaining(header))


class Handler(http.server.BaseHTTPRequestHandler):
    """Answers every request with one class, or with a redirect when the server has a target.

    Each request is kept on the server with its headers.
    """

    def do_GET(self) -> None:  # noqa: N802 - the name is fixed by the base class
        self.server.requests.append((self.path, dict(self.headers)))
        if self.server.redirect_to:
            self.send_response(302)
            self.send_header("Location", self.server.redirect_to + self.path)
            self.end_headers()
            return
        body = json.dumps([{"id": "7"}]).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header(REMAINING_HEADER, "12")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *arguments: object) -> None:
        """Keeps the test output clean."""


class Server:
    """A stand-in for the API on the loopback address, on a port the operating system picks."""

    def __init__(self, redirect_to: str = "") -> None:
        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.requests = []
        self.server.redirect_to = redirect_to
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    @property
    def requests(self) -> list:
        return self.server.requests

    def __enter__(self) -> "Server":
        self.thread.start()
        host, port = self.server.server_address[:2]
        self.url = f"http://{host}:{port}"
        return self

    def __exit__(self, *details: object) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)


# The proxy settings of the machine must not send a loopback request away.
NO_PROXY = {name: "" for name in ("http_proxy", "HTTP_PROXY", "https_proxy", "HTTPS_PROXY")}


class TheRealOpener(unittest.TestCase):
    def test_reads_an_answer_over_the_loopback_address(self) -> None:
        with mock.patch.dict(os.environ, NO_PROXY), Server() as api:
            answer = fetch_class(2028, api_key=KEY, api_url=api.url)

        self.assertEqual(answer.records, [{"id": "7"}])
        self.assertEqual(answer.calls_remaining, 12)
        path, headers = api.requests[0]
        self.assertEqual(path, "/recruiting/players?year=2028&classification=HighSchool&state=OH")
        self.assertEqual(headers["Authorization"], f"Bearer {KEY}")

    def test_does_not_follow_a_redirect_or_send_the_key_away(self) -> None:
        with mock.patch.dict(os.environ, NO_PROXY), Server() as other:
            with Server(redirect_to=other.url) as api:
                with self.assertRaises(FetchError) as caught:
                    fetch_class(2028, api_key=KEY, api_url=api.url)

        self.assertIn("answered 302", str(caught.exception))
        self.assertEqual(len(api.requests), 1)
        self.assertEqual(other.requests, [])

    def test_is_built_without_redirects(self) -> None:
        handlers = default_opener().__self__.handlers

        self.assertTrue(any(isinstance(handler, NoRedirect) for handler in handlers))
        self.assertFalse(
            any(type(handler) is urllib.request.HTTPRedirectHandler for handler in handlers)
        )


if __name__ == "__main__":
    unittest.main()
