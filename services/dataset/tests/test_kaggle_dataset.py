"""Tests for the metadata, the create-or-version choice, and the refusals Kaggle reports."""

from __future__ import annotations

import json
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from ohfootball_dataset import kaggle_dataset
from ohfootball_dataset.kaggle_dataset import (
    EXPECTED_UPDATE_FREQUENCY,
    KEYWORDS,
    LICENSE,
    METADATA_FILE,
    SOURCES,
    SUBTITLE,
    TITLE,
    Publication,
    dataset_description,
    dataset_exists,
    publish,
    resources,
    validate_dataset_id,
    write_metadata,
)
from ohfootball_dataset.marts import MARTS, Column, Mart

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
    def __init__(
        self,
        error: str | None = None,
        status: str | None = None,
        invalid_tags: list[str] | None = None,
    ) -> None:
        self.error = error
        self.status = status
        self.invalid_tags = invalid_tags or []


class FakeApi:
    """Stands in for the Kaggle client.

    The first status request answers whether the dataset exists. The requests after it take their
    answers from `statuses` in turn, and an answer that is an error is raised.
    """

    def __init__(
        self,
        *,
        status_error: Exception | None = None,
        statuses: list[object] | None = None,
        create_result: object = None,
        version_result: object = None,
        metadata_error: BaseException | None = None,
    ) -> None:
        self.status_error = status_error
        self.statuses = list(statuses) if statuses is not None else ["ready"]
        self.create_result = create_result if create_result is not None else FakeResult()
        self.version_result = version_result if version_result is not None else FakeResult()
        self.metadata_error = metadata_error
        self.status_calls: list[str] = []
        self.created: list[tuple[str, dict[str, object]]] = []
        self.versioned: list[tuple[str, dict[str, object]]] = []
        self.metadata_updates: list[tuple[str, str]] = []

    def dataset_status(self, dataset_id: str) -> object:
        self.status_calls.append(dataset_id)
        if len(self.status_calls) == 1:
            if self.status_error is not None:
                raise self.status_error
            return "ready"
        answer = self.statuses.pop(0) if len(self.statuses) > 1 else self.statuses[0]
        if isinstance(answer, BaseException):
            raise answer
        return answer

    def dataset_create_new(self, folder: str, **options: object) -> object:
        self.created.append((folder, options))
        return self.create_result

    def dataset_create_version(self, folder: str, **options: object) -> object:
        self.versioned.append((folder, options))
        return self.version_result

    def dataset_metadata_update(self, dataset_id: str, path: str) -> None:
        self.metadata_updates.append((dataset_id, path))
        if self.metadata_error is not None:
            raise self.metadata_error


class FakeClock:
    """A clock that moves only when the publication sleeps."""

    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def _publish(api: FakeApi, clock: FakeClock | None = None, **options: object) -> Publication:
    timer = clock or FakeClock()
    return publish(
        "/tmp/export",
        DATASET,
        version_notes="notes",
        api=api,
        sleep=timer.sleep,
        clock=timer,
        **options,  # type: ignore[arg-type]
    )


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


def _written(**options: object) -> dict[str, object]:
    with tempfile.TemporaryDirectory() as directory:
        path = write_metadata(directory, DATASET, **options)  # type: ignore[arg-type]
        return json.loads(path.read_text(encoding="utf-8"))


class TheMetadata(unittest.TestCase):
    def test_names_the_dataset_the_title_and_the_license(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = write_metadata(directory, DATASET)
            self.assertEqual(path.name, METADATA_FILE)
            body = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(body["id"], DATASET)
        self.assertEqual(body["licenses"], [{"name": LICENSE}])
        self.assertEqual(LICENSE, "CC0-1.0")
        self.assertEqual(body["title"], TITLE)
        self.assertEqual(body["description"], dataset_description())

    def test_holds_every_field_that_the_usability_rating_reads(self) -> None:
        body = _written()
        self.assertEqual(body["subtitle"], SUBTITLE)
        self.assertEqual(body["keywords"], list(KEYWORDS))
        self.assertEqual(body["expectedUpdateFrequency"], "weekly")
        self.assertEqual(EXPECTED_UPDATE_FREQUENCY, "weekly")
        self.assertEqual(body["userSpecifiedSources"], SOURCES)
        self.assertEqual(body["resources"], resources())

    def test_describes_every_published_file_and_only_those(self) -> None:
        body = _written()
        described = [resource["path"] for resource in body["resources"]]  # type: ignore[index]
        self.assertEqual(described, [mart.file_name for mart in MARTS])
        for mart in MARTS:
            self.assertIn(f"`{mart.file_name}`: {mart.description}", body["description"])

    def test_links_the_website_and_the_code(self) -> None:
        description = dataset_description()
        self.assertIn("(https://ohfootball.io)", description)
        self.assertIn("(https://github.com/StephenODea54/ohfootball.io)", description)
        self.assertIn("(https://github.com/StephenODea54/ohfootball.io/issues)", description)
        self.assertIn("https://github.com/StephenODea54/ohfootball.io", SOURCES)

    def test_names_no_column_or_file_in_the_description_that_is_not_published(self) -> None:
        published = {mart.name for mart in MARTS}
        published.update(name for mart in MARTS for name in mart.column_names)
        for text in (dataset_description(), SOURCES):
            for name in re.findall(r"\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b", text):
                self.assertIn(name, published)

    def test_names_the_columns_of_each_file_in_the_order_they_are_published(self) -> None:
        # Kaggle matches the columns by their order, and a description of a column that is not
        # published would land on the wrong column.
        for resource, mart in zip(resources(), MARTS, strict=True):
            fields = resource["schema"]["fields"]
            self.assertEqual([field["name"] for field in fields], list(mart.column_names))
            for field, column in zip(fields, mart.columns, strict=True):
                self.assertEqual(field["description"], column.description)

    def test_has_a_subtitle_and_keywords_that_kaggle_takes(self) -> None:
        self.assertGreaterEqual(len(SUBTITLE), 20)
        self.assertLessEqual(len(SUBTITLE), 80)
        self.assertTrue(KEYWORDS)
        self.assertTrue(all(keyword == keyword.lower().strip() for keyword in KEYWORDS))
        self.assertNotIn("football", KEYWORDS)

    def test_is_refused_for_a_subtitle_that_kaggle_would_refuse(self) -> None:
        for subtitle in ("S" * 19, "S" * 81):
            with tempfile.TemporaryDirectory() as directory:
                with self.assertRaisesRegex(ValueError, "20 to 80", msg=subtitle):
                    write_metadata(directory, DATASET, subtitle=subtitle)
                self.assertFalse((Path(directory) / METADATA_FILE).exists())

    def test_takes_a_subtitle_at_either_end_of_the_limit(self) -> None:
        for subtitle in ("S" * 20, "S" * 80):
            self.assertEqual(_written(subtitle=subtitle)["subtitle"], subtitle)

    def test_is_refused_for_a_frequency_that_kaggle_does_not_know(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "fortnightly"):
                write_metadata(directory, DATASET, expected_update_frequency="fortnightly")

    def test_is_refused_for_a_file_or_a_column_with_no_description(self) -> None:
        undescribed_file = Mart(
            name="dim_dates",
            columns=(Column("date_key", description="The key."),),
            order_by=("date_key",),
        )
        undescribed_column = Mart(
            name="dim_dates",
            columns=(Column("date_key"),),
            order_by=("date_key",),
            description="The calendar.",
        )
        with self.assertRaisesRegex(ValueError, "dim_dates.csv has no description"):
            resources([undescribed_file])
        with self.assertRaisesRegex(ValueError, "dim_dates.date_key has no description"):
            resources([undescribed_column])

    def test_takes_a_title_and_a_license_when_it_is_given_them(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = write_metadata(
                Path(directory),
                DATASET,
                title="Another Title",
                license_name="ODbL-1.0",
                description="Short.",
                keywords=("games",),
                expected_update_frequency="monthly",
                sources="Somewhere.",
            )
            body = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(body["title"], "Another Title")
        self.assertEqual(body["licenses"], [{"name": "ODbL-1.0"}])
        self.assertEqual(body["description"], "Short.")
        self.assertEqual(body["keywords"], ["games"])
        self.assertEqual(body["expectedUpdateFrequency"], "monthly")
        self.assertEqual(body["userSpecifiedSources"], "Somewhere.")

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
        self.assertEqual(_publish(api), Publication("created", "updated"))
        folder, options = api.created[0]
        self.assertEqual(folder, "/tmp/export")
        self.assertIs(options["public"], True)
        self.assertIs(options["convert_to_csv"], False)
        self.assertEqual(api.versioned, [])

    def test_adds_a_version_every_time_after_that(self) -> None:
        api = FakeApi()
        timer = FakeClock()
        publication = publish(
            Path("/tmp/export"),
            DATASET,
            version_notes="marts as of 2026-08-19",
            api=api,
            sleep=timer.sleep,
            clock=timer,
        )
        self.assertEqual(publication, Publication("versioned", "updated"))
        folder, options = api.versioned[0]
        self.assertEqual(folder, "/tmp/export")
        self.assertEqual(options["version_notes"], "marts as of 2026-08-19")
        self.assertIs(options["convert_to_csv"], False)
        self.assertEqual(api.created, [])

    def test_updates_the_metadata_from_the_same_folder_once_the_version_is_ready(self) -> None:
        # The upload does not send the update frequency or the sources. Only the metadata update
        # does, and it is sent after Kaggle has processed the files it describes.
        for status_error in (None, FakeHttpError(404)):
            api = FakeApi(status_error=status_error, statuses=["pending", "Processing", "READY"])
            timer = FakeClock()
            self.assertEqual(_publish(api, timer, poll_interval=15.0).metadata, "updated")
            self.assertEqual(api.metadata_updates, [(DATASET, "/tmp/export")])
            self.assertEqual(timer.sleeps, [15.0, 15.0])

    def test_asks_again_when_the_status_cannot_be_read(self) -> None:
        # The files are already uploaded, and a new dataset can be missing for a short time.
        api = FakeApi(
            status_error=FakeHttpError(404),
            statuses=[FakeHttpError(404), RuntimeError("no network"), "ready"],
        )
        self.assertEqual(_publish(api).metadata, "updated")
        self.assertEqual(len(api.metadata_updates), 1)

    def test_leaves_the_metadata_when_the_version_is_not_ready_in_time(self) -> None:
        api = FakeApi(statuses=["pending"])
        timer = FakeClock()
        publication = _publish(api, timer, ready_timeout=60.0, poll_interval=15.0)
        self.assertEqual(publication, Publication("versioned", "not ready"))
        self.assertEqual(api.metadata_updates, [])
        self.assertEqual(sum(timer.sleeps), 60.0)

    def test_fails_when_kaggle_could_not_process_the_version(self) -> None:
        for status in ("failed", "deleted"):
            api = FakeApi(statuses=[status])
            with self.assertRaisesRegex(RuntimeError, status):
                _publish(api)
            self.assertEqual(api.metadata_updates, [])

    def test_fails_when_kaggle_refuses_the_metadata(self) -> None:
        api = FakeApi(metadata_error=SystemExit(1))
        with self.assertRaisesRegex(RuntimeError, "refused the metadata"):
            _publish(api)

    def test_reports_the_keywords_that_kaggle_did_not_know(self) -> None:
        api = FakeApi(version_result=FakeResult(invalid_tags=["hsfb"]))
        self.assertEqual(_publish(api).invalid_tags, ("hsfb",))

        class CamelCaseResult:
            error = None
            status = "ok"
            invalidTags = ["hsfb", "ohio"]

        api = FakeApi(version_result=CamelCaseResult())
        self.assertEqual(_publish(api).invalid_tags, ("hsfb", "ohio"))

    def test_fails_when_kaggle_reports_an_error_rather_than_raising_one(self) -> None:
        refused_version = FakeApi(version_result=FakeResult(error="quota exceeded"))
        with self.assertRaises(RuntimeError):
            _publish(refused_version)
        self.assertEqual(refused_version.metadata_updates, [])

        refused_create = FakeApi(
            status_error=FakeHttpError(404),
            create_result=FakeResult(status="error"),
        )
        with self.assertRaises(RuntimeError):
            _publish(refused_create)
        self.assertEqual(refused_create.metadata_updates, [])

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
            publication = publish("/tmp/export", DATASET, version_notes="notes")
        self.assertEqual(publication.action, "versioned")
        self.assertEqual(built, ["built"])


if __name__ == "__main__":
    unittest.main()
