"""Uploading the zip to the Cloudflare R2 bucket that `data.ohfootball.io` serves.

Each run writes the zip and its manifest two times: under the date of the run, where they stay, and
under `latest/`, where each run replaces them. The dated copy is written first. So `latest/` never
names a date that the bucket does not hold. `snapshots.json` is written last. A public bucket does
not list its objects, so this file is how a reader finds the dates.

An object that already holds the same bytes and the same headers is not sent again. So a second
run on the same day sends only what changed.

R2 takes the S3 API. boto3 1.36 and later adds a CRC32 checksum to each upload by default. R2 does
not take that checksum on an upload of one part, so the client is built to send a checksum only
when the API requires one. Each upload sends `Content-MD5` in its place, and R2 refuses a body that
does not match it.

The client is built inside a function rather than when this module is read, so the command line and
the tests work on a machine that does not have boto3.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .archive import ARCHIVE_FILE, DOWNLOAD_URL, MANIFEST_FILE, Archive, manifest_with_archive
from .marts import MARTS, Mart

ACCOUNT_ID_VARIABLE = "R2_ACCOUNT_ID"
ACCESS_KEY_VARIABLE = "R2_ACCESS_KEY_ID"
SECRET_KEY_VARIABLE = "R2_SECRET_ACCESS_KEY"
BUCKET_VARIABLE = "R2_BUCKET"

ENDPOINT = "https://{account_id}.r2.cloudflarestorage.com"
REGION = "auto"

LATEST_PREFIX = "latest"
SNAPSHOTS_FILE = "snapshots.json"

# The largest object that R2 takes in one upload, which is 5 MiB less than 5 GiB.
SINGLE_UPLOAD_LIMIT = 5 * 1024**3 - 5 * 1024**2

# Cloudflare keeps a zip in its cache for two hours when the object has no Cache-Control. It does
# not cache JSON unless a Cache Rule tells it to, so for JSON this rule reaches only the browser.
# Every object has the same rule. A run that is run again on the same day replaces the dated zip,
# and a longer rule for that zip would let the cache serve the old zip beside the new manifest.
CACHE_CONTROL = "public, max-age=300, must-revalidate"

ZIP_TYPE = "application/zip"
JSON_TYPE = "application/json"

UPLOADED = "uploaded"
UNCHANGED = "unchanged"

# The codes that R2 answers with for an object that it does not hold.
_MISSING_CODES = frozenset({"404", "NoSuchKey", "NotFound"})
_DATE_PREFIX = re.compile(r"^\d{4}-\d{2}-\d{2}/$")


@dataclass(frozen=True, slots=True)
class Bucket:
    """The bucket and the token that writes to it."""

    account_id: str
    access_key_id: str
    secret_access_key: str
    name: str

    @property
    def endpoint_url(self) -> str:
        return ENDPOINT.format(account_id=self.account_id)

    def __repr__(self) -> str:
        # The token is kept out of a traceback or a log that prints the bucket.
        return f"Bucket(account_id={self.account_id!r}, name={self.name!r})"


@dataclass(frozen=True, slots=True)
class Upload:
    """What an upload did.

    `objects` holds each key in the order it was sent, with "uploaded" or "unchanged". `snapshots`
    holds each date that `snapshots.json` lists after the upload.
    """

    snapshot_key: str
    latest_key: str
    objects: tuple[tuple[str, str], ...]
    snapshots: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class _Object:
    key: str
    body: Path | bytes
    sha256: str
    md5: str
    content_type: str
    content_disposition: str | None = None
    cache_control: str = CACHE_CONTROL


def bucket_from_environment(
    environ: Mapping[str, str] | None = None, *, name: str | None = None
) -> Bucket:
    """Read the bucket and its token from the environment.

    `name` takes the place of R2_BUCKET. The error names each variable that is not set and holds
    no value of any of them.
    """
    values = os.environ if environ is None else environ
    settings = {
        ACCOUNT_ID_VARIABLE: values.get(ACCOUNT_ID_VARIABLE, ""),
        ACCESS_KEY_VARIABLE: values.get(ACCESS_KEY_VARIABLE, ""),
        SECRET_KEY_VARIABLE: values.get(SECRET_KEY_VARIABLE, ""),
        BUCKET_VARIABLE: name or values.get(BUCKET_VARIABLE, ""),
    }
    missing = [variable for variable, value in settings.items() if not value]
    if missing:
        raise ValueError(f"set {', '.join(missing)} to upload the download")
    return Bucket(
        settings[ACCOUNT_ID_VARIABLE],
        settings[ACCESS_KEY_VARIABLE],
        settings[SECRET_KEY_VARIABLE],
        settings[BUCKET_VARIABLE],
    )


def r2_client(bucket: Bucket) -> Any:
    """Build an S3 client for the R2 account of the bucket.

    It sends a checksum only when the API requires one, because R2 does not take the CRC32 checksum
    that boto3 adds by default. It checks a checksum in an answer on the same terms.
    """
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=bucket.endpoint_url,
        aws_access_key_id=bucket.access_key_id,
        aws_secret_access_key=bucket.secret_access_key,
        region_name=REGION,
        config=Config(
            signature_version="s3v4",
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
            retries={"mode": "standard", "max_attempts": 5},
        ),
    )


def snapshot_keys(archive: Archive) -> tuple[str, str]:
    """The keys of the zip and the manifest of the date of an archive."""
    prefix = archive.as_of_date.isoformat()
    return f"{prefix}/{ARCHIVE_FILE}", f"{prefix}/{MANIFEST_FILE}"


def latest_keys() -> tuple[str, str]:
    """The keys of the zip and the manifest that each run replaces."""
    return f"{LATEST_PREFIX}/{ARCHIVE_FILE}", f"{LATEST_PREFIX}/{MANIFEST_FILE}"


def upload_snapshot(
    client: Any, bucket_name: str, archive: Archive, *, marts: Iterable[Mart] = MARTS
) -> Upload:
    """Send the dated copy, then the copy under latest/, then the list of the dates.

    An error stops the upload at the object that failed. The objects before it stay. The objects
    after it keep what the run before sent.
    """
    if archive.bytes > SINGLE_UPLOAD_LIMIT:
        raise ValueError(
            f"the zip is {archive.bytes} bytes, and R2 takes at most {SINGLE_UPLOAD_LIMIT} "
            "in one upload"
        )
    snapshot_zip, snapshot_manifest = snapshot_keys(archive)
    latest_zip, latest_manifest = latest_keys()
    manifest_body = manifest_with_archive(archive, snapshot_zip, marts)
    disposition = f'attachment; filename="ohfootball-{archive.as_of_date.isoformat()}.zip"'

    def zipped(key: str) -> _Object:
        return _Object(key, archive.path, archive.sha256, archive.md5, ZIP_TYPE, disposition)

    objects = []
    for item in (
        zipped(snapshot_zip),
        _json_object(snapshot_manifest, manifest_body),
        zipped(latest_zip),
        _json_object(latest_manifest, manifest_body),
    ):
        objects.append((item.key, _put_if_changed(client, bucket_name, item)))

    dates = tuple(sorted(_snapshot_dates(client, bucket_name) | {archive.as_of_date.isoformat()}))
    index = {
        "latest": archive.as_of_date.isoformat(),
        "snapshots": list(dates),
        "url": DOWNLOAD_URL,
    }
    body = (json.dumps(index, indent=2, sort_keys=True) + "\n").encode("utf-8")
    item = _json_object(SNAPSHOTS_FILE, body)
    objects.append((item.key, _put_if_changed(client, bucket_name, item)))
    return Upload(snapshot_zip, latest_zip, tuple(objects), dates)


def _json_object(key: str, body: bytes) -> _Object:
    sha256 = hashlib.sha256(body).hexdigest()
    md5 = hashlib.md5(body, usedforsecurity=False).hexdigest()
    return _Object(key, body, sha256, md5, JSON_TYPE)


def _put_if_changed(client: Any, bucket_name: str, item: _Object) -> str:
    """Send an object unless the bucket holds the same bytes with the same headers.

    A key that the bucket does not hold is sent. Any other error from the check is raised, because
    a token that cannot read the bucket cannot be trusted to write it either.
    """
    try:
        head = client.head_object(Bucket=bucket_name, Key=item.key)
    except Exception as error:
        if _error_code(error) not in _MISSING_CODES:
            raise
    else:
        if _holds(head, item):
            return UNCHANGED

    options: dict[str, Any] = {
        "Bucket": bucket_name,
        "Key": item.key,
        "ContentType": item.content_type,
        "CacheControl": item.cache_control,
        "ContentMD5": _md5_base64(item.md5),
        "Metadata": {"sha256": item.sha256},
    }
    if item.content_disposition:
        options["ContentDisposition"] = item.content_disposition
    if isinstance(item.body, Path):
        # An open file lets the client send the zip one block at a time, and go back to the start
        # of it to try again.
        with item.body.open("rb") as body:
            client.put_object(Body=body, **options)
    else:
        client.put_object(Body=item.body, **options)
    return UPLOADED


def _holds(head: Mapping[str, Any], item: _Object) -> bool:
    """Whether an object that the bucket holds has the bytes and the headers of an item."""
    metadata = head.get("Metadata") or {}
    return (
        metadata.get("sha256") == item.sha256
        and head.get("ContentType") == item.content_type
        and head.get("CacheControl") == item.cache_control
        and head.get("ContentDisposition") == item.content_disposition
    )


def _snapshot_dates(client: Any, bucket_name: str) -> set[str]:
    """Each date that the bucket holds a copy of, read from the prefixes at its top level."""
    dates: set[str] = set()
    token: str | None = None
    while True:
        options: dict[str, Any] = {"Bucket": bucket_name, "Delimiter": "/"}
        if token:
            options["ContinuationToken"] = token
        page = client.list_objects_v2(**options)
        for entry in page.get("CommonPrefixes") or []:
            prefix = str(entry.get("Prefix", ""))
            if _DATE_PREFIX.fullmatch(prefix):
                dates.add(prefix[:-1])
        token = page.get("NextContinuationToken")
        if not (page.get("IsTruncated") and token):
            return dates


def _error_code(error: BaseException) -> str | None:
    """The code of an error that the client raises, if it carries one."""
    response = getattr(error, "response", None)
    if not isinstance(response, Mapping):
        return None
    details = response.get("Error")
    code = details.get("Code") if isinstance(details, Mapping) else None
    return str(code) if code is not None else None


def _md5_base64(hex_digest: str) -> str:
    return base64.b64encode(bytes.fromhex(hex_digest)).decode("ascii")
