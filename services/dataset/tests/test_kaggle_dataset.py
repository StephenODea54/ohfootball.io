"""Tests for the metadata, the create-or-version choice, and the refusals Kaggle reports."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from ohfootball_dataset import kaggle_dataset
from ohfootball_dataset.kaggle_dataset import (
    LICENSE,
    METADATA_FILE,
    TITLE,
    dataset_exists,
    publish,
    validate_dataset_id,
    write_metadata,
)

DATASET = "someone/ohfootball-high-school-football"


class FakeResponse:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code


class FakeHttpError(Exception):
    """Stands in for the error the Kaggle client raises, which carries the response."""

    def __init__(self, status_code: int) -> None:
        super().__init__(f"status {status_code}")
        self.response = FakeResponse(status_code)


class FakeResult:
    def __init__(self, error: str | None = None, status: str | None = None) -> None:
        self.error = error
        self.status = status


class FakeApi:
    def __init__(
        self,
        *,
        status_error: Exception | None = None,
        create_result: object = None,
        version_result: object = None,
    ) -> None:
        self.status_error = status_error
        self.create_result = create_result if create_result is not None else FakeResult()
        self.version_result = version_result if version_result is not None else FakeResult()
        self.status_calls: list[str] = []
        self.created: list[tuple[str, dict[str, object]]] = []
        self.versioned: list[tuple[str, dict[str, object]]] = []

    def dataset_status(self, dataset_id: str) -> str:
        self.status_calls.append(dataset_id)
        if self.status_error is not None:
            raise self.status_error
        return "ready"

    def dataset_create_new(self, folder: str, **options: object) -> object:
        self.created.append((folder, options))
        return self.create_result

    def dataset_create_version(self, folder: str, **options: object) -> object:
        self.versioned.append((folder, options))
        return self.version_result


class TheDatasetName(unittest.TestCase):
    def test_is_an_owner_and_a_slug(self) -> None:
        self.assertEqual(validate_dataset_id(DATASET), DATASET)

    def test_is_refused_when_it_names_one_or_neither(self) -> None:
        for name in ("", "ohfootball", "someone/", "/slug", "a/b/c"):
            with self.assertRaises(ValueError, msg=name):
                validate_dataset_id(name)

    def test_is_refused_when_the_slug_is_too_short_or_too_long_for_kaggle(self) -> None:
        for slug in ("slug5", "s" * 51):
            with self.assertRaisesRegex(ValueError, "6 to 50", msg=slug):
                validate_dataset_id(f"someone/{slug}")

    def test_takes_a_slug_at_either_end_of_the_limit(self) -> None:
        for slug in ("slug66", "s" * 50):
            self.assertEqual(validate_dataset_id(f"someone/{slug}"), f"someone/{slug}")


class TheMetadata(unittest.TestCase):
    def test_names_the_dataset_the_title_and_the_license(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = write_metadata(directory, DATASET)
            self.assertEqual(path.name, METADATA_FILE)
            body = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(body["id"], DATASET)
        self.assertEqual(body["licenses"], [{"name": LICENSE}])
        self.assertEqual(LICENSE, "CC0-1.0")
        self.assertTrue(body["title"])
        self.assertIn("fct_games.csv", body["description"])

    def test_takes_a_title_and_a_license_when_it_is_given_them(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = write_metadata(
                Path(directory),
                DATASET,
                title="Another Title",
                license_name="ODbL-1.0",
                description="Short.",
            )
            body = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(body["title"], "Another Title")
        self.assertEqual(body["licenses"], [{"name": "ODbL-1.0"}])
        self.assertEqual(body["description"], "Short.")

    def test_is_refused_for_a_name_that_is_not_owner_and_slug(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                write_metadata(directory, "ohfootball")

    def test_has_a_title_that_kaggle_takes(self) -> None:
        # Kaggle refuses to create a dataset whose title is outside 6 to 50 characters.
        self.assertGreaterEqual(len(TITLE), 6)
        self.assertLessEqual(len(TITLE), 50)

    def test_is_refused_for_a_title_that_kaggle_would_refuse(self) -> None:
        for title in ("Short", "T" * 51):
            with tempfile.TemporaryDirectory() as directory:
                with self.assertRaisesRegex(ValueError, "6 to 50", msg=title):
                    write_metadata(directory, DATASET, title=title)
                self.assertFalse((Path(directory) / METADATA_FILE).exists())


class TheQuestionOfWhetherItExists(unittest.TestCase):
    def test_is_answered_yes_when_kaggle_reports_the_dataset(self) -> None:
        api = FakeApi()
        self.assertTrue(dataset_exists(api, DATASET))
        self.assertEqual(api.status_calls, [DATASET])

    def test_is_answered_no_when_kaggle_hides_or_denies_it(self) -> None:
        for status_code in (403, 404):
            api = FakeApi(status_error=FakeHttpError(status_code))
            self.assertFalse(dataset_exists(api, DATASET), status_code)

    def test_is_not_answered_when_kaggle_fails_for_another_reason(self) -> None:
        for error in (FakeHttpError(500), RuntimeError("no network")):
            api = FakeApi(status_error=error)
            with self.assertRaises(type(error)):
                dataset_exists(api, DATASET)


class ThePublication(unittest.TestCase):
    def test_creates_a_public_dataset_the_first_time(self) -> None:
        api = FakeApi(status_error=FakeHttpError(404))
        self.assertEqual(publish("/tmp/export", DATASET, version_notes="notes", api=api), "created")
        folder, options = api.created[0]
        self.assertEqual(folder, "/tmp/export")
        self.assertIs(options["public"], True)
        self.assertIs(options["convert_to_csv"], False)
        self.assertEqual(api.versioned, [])

    def test_adds_a_version_every_time_after_that(self) -> None:
        api = FakeApi()
        self.assertEqual(
            publish(Path("/tmp/export"), DATASET, version_notes="marts as of 2026-08-19", api=api),
            "versioned",
        )
        folder, options = api.versioned[0]
        self.assertEqual(folder, "/tmp/export")
        self.assertEqual(options["version_notes"], "marts as of 2026-08-19")
        self.assertIs(options["convert_to_csv"], False)
        self.assertEqual(api.created, [])

    def test_fails_when_kaggle_reports_an_error_rather_than_raising_one(self) -> None:
        refused_version = FakeApi(version_result=FakeResult(error="quota exceeded"))
        with self.assertRaises(RuntimeError):
            publish("/tmp/export", DATASET, version_notes="notes", api=refused_version)

        refused_create = FakeApi(
            status_error=FakeHttpError(404),
            create_result=FakeResult(status="error"),
        )
        with self.assertRaises(RuntimeError):
            publish("/tmp/export", DATASET, version_notes="notes", api=refused_create)

    def test_is_refused_for_a_name_that_is_not_owner_and_slug(self) -> None:
        with self.assertRaises(ValueError):
            publish("/tmp/export", "ohfootball", version_notes="notes", api=FakeApi())


class TheKaggleClient(unittest.TestCase):
    # Reading the module must not read the client. The client raises when it finds no credentials,
    # and the command line and these tests run on a machine that holds none.
    def test_is_not_read_when_the_module_is_read(self) -> None:
        self.assertNotIn("kaggle", sys.modules)

    def test_is_built_and_authenticated_when_it_is_asked_for(self) -> None:
        calls: list[str] = []

        class FakeKaggleApi:
            def authenticate(self) -> None:
                calls.append("authenticate")

        extended = type(sys)("kaggle.api.kaggle_api_extended")
        extended.KaggleApi = FakeKaggleApi  # type: ignore[attr-defined]
        modules = {
            "kaggle": type(sys)("kaggle"),
            "kaggle.api": type(sys)("kaggle.api"),
            "kaggle.api.kaggle_api_extended": extended,
        }
        with mock.patch.dict(sys.modules, modules):
            api = kaggle_dataset.authenticated_api()
        self.assertIsInstance(api, FakeKaggleApi)
        self.assertEqual(calls, ["authenticate"])

    def test_is_built_by_publish_when_it_is_given_no_client(self) -> None:
        built: list[str] = []

        class OneShotApi(FakeApi):
            pass

        api = OneShotApi()

        def fake_authenticated_api() -> FakeApi:
            built.append("built")
            return api

        with mock.patch.object(kaggle_dataset, "authenticated_api", fake_authenticated_api):
            self.assertEqual(publish("/tmp/export", DATASET, version_notes="notes"), "versioned")
        self.assertEqual(built, ["built"])


if __name__ == "__main__":
    unittest.main()
