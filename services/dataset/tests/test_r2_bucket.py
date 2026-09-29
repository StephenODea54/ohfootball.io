"""Tests for the settings, the client, and the order and headers of the upload."""

from __future__ import annotations

import base64
import hashlib
import json
import subprocess
import sys
import tempfile
import types
import unittest
from datetime import date
from pathlib import Path
from typing import Any
from unittest import mock

from ohfootball_dataset import r2_bucket
from ohfootball_dataset.archive import DOWNLOAD_URL, Archive, ArchivedFile
from ohfootball_dataset.marts import MARTS
from ohfootball_dataset.r2_bucket import (
    CACHE_CONTROL,
    JSON_TYPE,
    UNCHANGED,
    UPLOADED,
    ZIP_TYPE,
    Bucket,
    bucket_from_environment,
    latest_keys,
    r2_client,
    upload_snapshot,
)

DAY = date(2026, 9, 29)
SECRET = "r2-secret-0000000000000000000000000000"
SETTINGS = {
    "R2_ACCOUNT_ID": "0123456789abcdef",
    "R2_ACCESS_KEY_ID": "access-key",
    "R2_SECRET_ACCESS_KEY": SECRET,
    "R2_BUCKET": "ohfootball-data",
}
ZIP_BYTES = b"PK zip bytes"
ORDER = [
    "2026-09-29/ohfootball.zip",
    "2026-09-29/manifest.json",
    "latest/ohfootball.zip",
    "latest/manifest.json",
    "snapshots.json",
]


class FakeClientError(Exception):
    """Stands in for the error botocore raises, which carries the code in its response."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.response = {"Error": {"Code": code}}


class FakeClient:
    """Stands in for the S3 client. It keeps each object it is sent, with its headers.

    `head_errors` names a key whose check raises. `put_errors` names a key whose upload raises.
    `pages` are the answers to the list of the top level, in turn. With no pages, the list names
    the prefixes of the objects it holds, on one page.
    """

    def __init__(
        self,
        *,
        head_errors: dict[str, Exception] | None = None,
        put_errors: dict[str, Exception] | None = None,
        pages: list[dict[str, Any]] | None = None,
    ) -> None:
        self.stored: dict[str, dict[str, Any]] = {}
        self.head_errors = head_errors or {}
        self.put_errors = put_errors or {}
        self.pages = pages
        self.puts: list[dict[str, Any]] = []
        self.list_calls: list[dict[str, Any]] = []
        self.bodies_closed: list[bool] = []

    def head_object(self, *, Bucket: str, Key: str) -> dict[str, Any]:  # noqa: N803
        if Key in self.head_errors:
            raise self.head_errors[Key]
        if Key not in self.stored:
            raise FakeClientError("404")
        return self.stored[Key]

    def put_object(self, *, Body: Any, **options: Any) -> None:  # noqa: N803
        if options["Key"] in self.put_errors:
            raise self.put_errors[options["Key"]]
        if hasattr(Body, "read"):
            options["streamed"] = True
            options["body"] = Body.read()
            self.bodies_closed.append(Body)
        else:
            options["streamed"] = False
            options["body"] = Body
        self.puts.append(options)
        self.stored[options["Key"]] = {
            "Metadata": options["Metadata"],
            "ContentType": options["ContentType"],
            "CacheControl": options["CacheControl"],
            **(
                {"ContentDisposition": options["ContentDisposition"]}
                if "ContentDisposition" in options
                else {}
            ),
        }

    def list_objects_v2(self, **options: Any) -> dict[str, Any]:
        self.list_calls.append(options)
        if self.pages is not None:
            return self.pages[len(self.list_calls) - 1]
        prefixes = sorted({key.split("/")[0] + "/" for key in self.stored if "/" in key})
        return {"CommonPrefixes": [{"Prefix": prefix} for prefix in prefixes]}

    def put_keys(self) -> list[str]:
        return [put["Key"] for put in self.puts]


class TheSettings(unittest.TestCase):
    def test_are_read_from_the_environment(self) -> None:
        bucket = bucket_from_environment(SETTINGS)
        self.assertEqual(bucket.name, "ohfootball-data")
        self.assertEqual(bucket.access_key_id, "access-key")
        self.assertEqual(bucket.secret_access_key, SECRET)
        self.assertEqual(bucket.endpoint_url, "https://0123456789abcdef.r2.cloudflarestorage.com")

    def test_read_the_process_environment_by_default(self) -> None:
        with mock.patch.dict("os.environ", SETTINGS, clear=True):
            self.assertEqual(bucket_from_environment().name, "ohfootball-data")

    def test_take_the_name_of_the_bucket_from_the_command_line_first(self) -> None:
        self.assertEqual(bucket_from_environment(SETTINGS, name="other").name, "other")

    def test_name_each_missing_variable_and_no_value(self) -> None:
        partial = {"R2_ACCOUNT_ID": "0123456789abcdef", "R2_SECRET_ACCESS_KEY": SECRET}
        with self.assertRaises(ValueError) as caught:
            bucket_from_environment(partial)
        message = str(caught.exception)
        self.assertIn("R2_ACCESS_KEY_ID", message)
        self.assertIn("R2_BUCKET", message)
        self.assertNotIn("R2_ACCOUNT_ID", message)
        self.assertNotIn(SECRET, message)

    def test_keep_the_token_out_of_the_text_of_the_bucket(self) -> None:
        text = repr(bucket_from_environment(SETTINGS))
        self.assertNotIn(SECRET, text)
        self.assertNotIn("access-key", text)
        self.assertIn("ohfootball-data", text)


class TheClient(unittest.TestCase):
    def test_is_not_imported_when_the_module_is_read(self) -> None:
        script = (
            "import sys, ohfootball_dataset.r2_bucket; sys.exit(1 if 'boto3' in sys.modules else 0)"
        )
        result = subprocess.run(
            [sys.executable, "-c", script],
            env={"PYTHONPATH": str(Path(r2_bucket.__file__).parents[1])},
            check=False,
        )
        self.assertEqual(result.returncode, 0)

    def test_is_built_with_the_endpoint_the_region_and_no_default_checksum(self) -> None:
        calls: dict[str, Any] = {}
        fake_boto3 = types.ModuleType("boto3")
        fake_boto3.client = lambda service, **options: calls.update(service=service, **options)
        fake_config = types.ModuleType("botocore.config")
        fake_config.Config = lambda **options: ("config", options)
        fake_botocore = types.ModuleType("botocore")
        fake_botocore.config = fake_config
        modules = {"boto3": fake_boto3, "botocore": fake_botocore, "botocore.config": fake_config}
        with mock.patch.dict(sys.modules, modules):
            r2_client(bucket_from_environment(SETTINGS))
        self.assertEqual(calls["service"], "s3")
        self.assertEqual(calls["endpoint_url"], "https://0123456789abcdef.r2.cloudflarestorage.com")
        self.assertEqual(calls["region_name"], "auto")
        self.assertEqual(calls["aws_access_key_id"], "access-key")
        self.assertEqual(calls["aws_secret_access_key"], SECRET)
        _, config = calls["config"]
        self.assertEqual(config["signature_version"], "s3v4")
        self.assertEqual(config["request_checksum_calculation"], "when_required")
        self.assertEqual(config["response_checksum_validation"], "when_required")


class TheUpload(unittest.TestCase):
    def setUp(self) -> None:
        self.folder = tempfile.TemporaryDirectory()
        path = Path(self.folder.name) / "ohfootball.zip"
        path.write_bytes(ZIP_BYTES)
        files = tuple(ArchivedFile(mart.file_name, 1, 1, "00") for mart in MARTS)
        self.archive = Archive(
            path,
            DAY,
            len(ZIP_BYTES),
            hashlib.sha256(ZIP_BYTES).hexdigest(),
            hashlib.md5(ZIP_BYTES).hexdigest(),
            files,
        )

    def tearDown(self) -> None:
        self.folder.cleanup()

    def test_sends_the_dated_copy_before_latest_and_the_list_of_dates_last(self) -> None:
        client = FakeClient()
        upload = upload_snapshot(client, "ohfootball-data", self.archive)
        self.assertEqual(client.put_keys(), ORDER)
        self.assertEqual(upload.objects, tuple((key, UPLOADED) for key in ORDER))
        self.assertEqual(upload.snapshot_key, "2026-09-29/ohfootball.zip")
        self.assertEqual(upload.latest_key, "latest/ohfootball.zip")
        self.assertEqual({put["Bucket"] for put in client.puts}, {"ohfootball-data"})

    def test_sends_the_type_the_cache_rule_the_name_and_the_digest(self) -> None:
        client = FakeClient()
        upload_snapshot(client, "ohfootball-data", self.archive)
        puts = {put["Key"]: put for put in client.puts}
        expected = {
            ORDER[0]: ZIP_TYPE,
            ORDER[1]: JSON_TYPE,
            ORDER[2]: ZIP_TYPE,
            ORDER[3]: JSON_TYPE,
            ORDER[4]: JSON_TYPE,
        }
        for key, content_type in expected.items():
            put = puts[key]
            self.assertEqual(put["ContentType"], content_type, key)
            self.assertEqual(put["CacheControl"], CACHE_CONTROL, key)
            self.assertEqual(
                put["ContentMD5"],
                base64.b64encode(hashlib.md5(put["body"]).digest()).decode(),
                key,
            )
            self.assertEqual(
                put["Metadata"], {"sha256": hashlib.sha256(put["body"]).hexdigest()}, key
            )
        for key in (ORDER[0], ORDER[2]):
            self.assertEqual(
                puts[key]["ContentDisposition"], 'attachment; filename="ohfootball-2026-09-29.zip"'
            )
            self.assertEqual(puts[key]["body"], ZIP_BYTES)
        for key in ORDER[1:2] + ORDER[3:]:
            self.assertNotIn("ContentDisposition", puts[key])

    def test_sends_one_manifest_under_both_keys_that_names_the_dated_zip(self) -> None:
        client = FakeClient()
        upload_snapshot(client, "ohfootball-data", self.archive)
        puts = {put["Key"]: put for put in client.puts}
        self.assertEqual(puts[ORDER[1]]["body"], puts[ORDER[3]]["body"])
        body = json.loads(puts[ORDER[1]]["body"])
        self.assertEqual(body["archive"]["key"], ORDER[0])
        self.assertEqual(body["archive"]["sha256"], self.archive.sha256)

    def test_streams_the_zip_from_an_open_file_and_closes_it(self) -> None:
        client = FakeClient()
        upload_snapshot(client, "ohfootball-data", self.archive)
        puts = {put["Key"]: put for put in client.puts}
        self.assertTrue(puts[ORDER[0]]["streamed"])
        self.assertFalse(puts[ORDER[1]]["streamed"])
        self.assertTrue(client.bodies_closed)
        self.assertTrue(all(body.closed for body in client.bodies_closed))

    def test_sends_nothing_again_when_the_bucket_holds_the_same_objects(self) -> None:
        client = FakeClient()
        upload_snapshot(client, "ohfootball-data", self.archive)
        client.puts.clear()
        upload = upload_snapshot(client, "ohfootball-data", self.archive)
        self.assertEqual(client.puts, [])
        self.assertEqual(upload.objects, tuple((key, UNCHANGED) for key in ORDER))

    def test_sends_an_object_again_when_its_bytes_differ(self) -> None:
        client = FakeClient()
        client.stored[ORDER[0]] = {
            "Metadata": {"sha256": "other"},
            "ContentType": ZIP_TYPE,
            "CacheControl": CACHE_CONTROL,
            "ContentDisposition": 'attachment; filename="ohfootball-2026-09-29.zip"',
        }
        upload_snapshot(client, "ohfootball-data", self.archive)
        self.assertEqual(client.put_keys(), ORDER)

    def test_sends_an_object_again_when_its_headers_differ(self) -> None:
        client = FakeClient()
        upload_snapshot(client, "ohfootball-data", self.archive)
        client.stored[ORDER[2]]["CacheControl"] = "public, max-age=7200"
        client.stored[ORDER[3]]["Metadata"] = {}
        client.puts.clear()
        upload_snapshot(client, "ohfootball-data", self.archive)
        self.assertEqual(client.put_keys(), [ORDER[2], ORDER[3]])

    def test_leaves_latest_alone_when_the_dated_copy_fails(self) -> None:
        client = FakeClient(put_errors={ORDER[0]: FakeClientError("BadDigest")})
        with self.assertRaises(FakeClientError):
            upload_snapshot(client, "ohfootball-data", self.archive)
        self.assertEqual(client.puts, [])
        self.assertEqual(client.stored, {})

    def test_stops_when_the_bucket_cannot_be_read(self) -> None:
        client = FakeClient(head_errors={ORDER[0]: FakeClientError("403")})
        with self.assertRaises(FakeClientError):
            upload_snapshot(client, "ohfootball-data", self.archive)
        self.assertEqual(client.puts, [])

    def test_stops_on_an_error_that_carries_no_code(self) -> None:
        client = FakeClient(head_errors={ORDER[0]: ConnectionError("no route")})
        with self.assertRaises(ConnectionError):
            upload_snapshot(client, "ohfootball-data", self.archive)

    def test_takes_each_code_for_a_missing_object_as_missing(self) -> None:
        for code in ("404", "NoSuchKey", "NotFound"):
            with self.subTest(code=code):
                client = FakeClient(head_errors={ORDER[0]: FakeClientError(code)})
                upload_snapshot(client, "ohfootball-data", self.archive)
                self.assertEqual(client.put_keys(), ORDER)

    def test_refuses_a_zip_larger_than_one_upload_takes(self) -> None:
        client = FakeClient()
        with mock.patch.object(r2_bucket, "SINGLE_UPLOAD_LIMIT", len(ZIP_BYTES) - 1):
            with self.assertRaisesRegex(ValueError, "at most"):
                upload_snapshot(client, "ohfootball-data", self.archive)
        self.assertEqual(client.puts, [])

    def test_lists_each_dated_prefix_on_every_page_and_adds_the_day(self) -> None:
        client = FakeClient(
            pages=[
                {
                    "CommonPrefixes": [{"Prefix": "2026-09-15/"}, {"Prefix": "latest/"}],
                    "IsTruncated": True,
                    "NextContinuationToken": "page-2",
                },
                {"CommonPrefixes": [{"Prefix": "2026-09-22/"}, {"Prefix": "2026-09-29/"}]},
            ]
        )
        upload = upload_snapshot(client, "ohfootball-data", self.archive)
        self.assertEqual(upload.snapshots, ("2026-09-15", "2026-09-22", "2026-09-29"))
        self.assertEqual(
            client.list_calls,
            [
                {"Bucket": "ohfootball-data", "Delimiter": "/"},
                {"Bucket": "ohfootball-data", "Delimiter": "/", "ContinuationToken": "page-2"},
            ],
        )
        index = json.loads(client.puts[-1]["body"])
        self.assertEqual(
            index,
            {
                "latest": "2026-09-29",
                "snapshots": ["2026-09-15", "2026-09-22", "2026-09-29"],
                "url": DOWNLOAD_URL,
            },
        )

    def test_stops_listing_a_truncated_page_that_gives_no_token(self) -> None:
        client = FakeClient(pages=[{"IsTruncated": True}])
        upload = upload_snapshot(client, "ohfootball-data", self.archive)
        self.assertEqual(len(client.list_calls), 1)
        self.assertEqual(upload.snapshots, ("2026-09-29",))

    def test_writes_the_keys_of_latest_under_one_prefix(self) -> None:
        self.assertEqual(latest_keys(), ("latest/ohfootball.zip", "latest/manifest.json"))


class TheErrorCode(unittest.TestCase):
    def test_is_read_from_the_response_of_the_error(self) -> None:
        self.assertEqual(r2_bucket._error_code(FakeClientError("NoSuchKey")), "NoSuchKey")

    def test_is_none_for_an_error_with_no_response(self) -> None:
        self.assertIsNone(r2_bucket._error_code(ValueError("plain")))

    def test_is_none_for_a_response_that_is_not_a_mapping(self) -> None:
        error = ValueError("odd")
        error.response = "text"  # type: ignore[attr-defined]
        self.assertIsNone(r2_bucket._error_code(error))

    def test_is_none_for_a_response_with_no_error(self) -> None:
        error = ValueError("odd")
        error.response = {"Error": "text"}  # type: ignore[attr-defined]
        self.assertIsNone(r2_bucket._error_code(error))
        error.response = {"Error": {}}  # type: ignore[attr-defined]
        self.assertIsNone(r2_bucket._error_code(error))


class TheBucket(unittest.TestCase):
    def test_names_its_endpoint_by_the_account(self) -> None:
        bucket = Bucket("abc", "key", "secret", "name")
        self.assertEqual(bucket.endpoint_url, "https://abc.r2.cloudflarestorage.com")


if __name__ == "__main__":
    unittest.main()
