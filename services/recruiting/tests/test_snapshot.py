import json
import unittest
from datetime import date

from fakes import FakeApi, FakeStore

from ohfootball_recruiting.snapshot import ClassResult, SnapshotFailed, Summary, take_snapshot

DAY = date(2026, 9, 29)
CLASSES = (2027, 2028, 2029)


def snapshot(store: FakeStore, api: FakeApi, floor: int = 100) -> Summary:
    return take_snapshot(
        snapshot_date=DAY,
        season=2026,
        classes=CLASSES,
        fetch=api,
        store=store,
        calls_remaining_floor=floor,
    )


class TheSnapshot(unittest.TestCase):
    def test_stores_each_class_with_one_call(self) -> None:
        store, api = FakeStore(), FakeApi(remaining={2029: 897})
        summary = snapshot(store, api)

        self.assertEqual(api.calls, [2027, 2028, 2029])
        self.assertEqual(summary.calls_made, 3)
        self.assertEqual(summary.calls_remaining, 897)
        self.assertEqual(summary.classes, [ClassResult(year, "stored", 2) for year in CLASSES])
        self.assertIsNone(summary.error)
        first, records = store.written[0]
        self.assertEqual(
            (first.snapshot_date, first.class_year, first.season, first.record_count),
            (DAY, 2027, 2026, 2),
        )
        self.assertEqual(first.source_url, "http://api.test/recruiting/players?year=2027")
        self.assertEqual(first.calls_remaining, 900)
        self.assertEqual(records, [{"id": "20270"}, {"id": "20271"}])

    def test_calls_after_the_lock_and_the_check(self) -> None:
        store = FakeStore()
        snapshot(store, FakeApi(events=store.events))

        self.assertEqual(
            store.events[:4],
            [("lock", 2027), ("is_stored", 2027), ("fetch", 2027), ("write", 2027)],
        )

    def test_keeps_a_class_that_is_stored_and_makes_no_call_for_it(self) -> None:
        store, api = FakeStore(stored={(DAY, 2028)}), FakeApi()
        summary = snapshot(store, api)

        self.assertEqual(api.calls, [2027, 2029])
        self.assertEqual(summary.calls_made, 2)
        self.assertEqual(summary.classes[1], ClassResult(2028, "kept", None))

    def test_makes_no_call_on_a_second_run_of_the_same_date(self) -> None:
        store = FakeStore()
        snapshot(store, FakeApi())
        again = FakeApi()
        summary = snapshot(store, again)

        self.assertEqual(again.calls, [])
        self.assertEqual(summary.calls_made, 0)
        self.assertIsNone(summary.calls_remaining)
        self.assertEqual([result.status for result in summary.classes], ["kept"] * 3)


class TheStops(unittest.TestCase):
    def test_stop_at_the_first_failed_call_and_store_nothing_for_it(self) -> None:
        store, api = FakeStore(), FakeApi(fail={2028})
        with self.assertRaises(SnapshotFailed) as caught:
            snapshot(store, api)
        summary = caught.exception.summary

        self.assertEqual(api.calls, [2027, 2028])
        self.assertEqual(summary.calls_made, 2)
        self.assertEqual(summary.classes, [ClassResult(2027, "stored", 2)])
        self.assertEqual(summary.error, "CollegeFootballData answered 503 for class 2028")
        self.assertEqual(str(caught.exception), summary.error)
        self.assertEqual({key[1] for key in store.stored}, {2027})
        self.assertEqual(store.rollbacks, 1)

    def test_a_later_run_calls_only_for_the_missing_classes(self) -> None:
        store = FakeStore()
        with self.assertRaises(SnapshotFailed):
            snapshot(store, FakeApi(fail={2028}))
        again = FakeApi()
        snapshot(store, again)

        self.assertEqual(again.calls, [2028, 2029])

    def test_stop_when_the_warehouse_refuses_a_class(self) -> None:
        store, api = FakeStore(refuse={2027}), FakeApi()
        with self.assertRaises(SnapshotFailed) as caught:
            snapshot(store, api)

        self.assertEqual(api.calls, [2027])
        self.assertIn("class 2027", caught.exception.summary.error)
        self.assertEqual(caught.exception.summary.calls_made, 1)
        self.assertEqual(store.stored, set())

    def test_stop_when_fewer_calls_are_left_than_the_floor(self) -> None:
        store, api = FakeStore(), FakeApi(remaining={2027: 99})
        with self.assertRaises(SnapshotFailed) as caught:
            snapshot(store, api)
        summary = caught.exception.summary

        self.assertEqual(api.calls, [2027])
        self.assertEqual(summary.classes, [ClassResult(2027, "stored", 2)])
        self.assertEqual(store.stored, {(DAY, 2027)})
        self.assertIn("99 calls left", summary.error)
        self.assertIn("floor of 100", summary.error)

    def test_do_not_stop_at_the_floor_after_the_last_class(self) -> None:
        summary = snapshot(FakeStore(), FakeApi(remaining={2029: 5}))

        self.assertIsNone(summary.error)
        self.assertEqual(summary.calls_remaining, 5)

    def test_do_not_stop_when_the_count_of_calls_is_unknown(self) -> None:
        api = FakeApi(remaining=dict.fromkeys(CLASSES))
        summary = snapshot(FakeStore(), api)

        self.assertEqual(api.calls, list(CLASSES))
        self.assertIsNone(summary.calls_remaining)

    def test_keep_the_last_known_count_of_calls(self) -> None:
        summary = snapshot(FakeStore(), FakeApi(remaining={2027: 800, 2028: None, 2029: None}))

        self.assertEqual(summary.calls_remaining, 800)

    def test_let_an_unknown_error_go_through_and_store_nothing_for_its_class(self) -> None:
        store = FakeStore()

        def fetch(class_year):
            raise RuntimeError("a fault in the code")

        with self.assertRaises(RuntimeError):
            take_snapshot(
                snapshot_date=DAY,
                season=2026,
                classes=CLASSES,
                fetch=fetch,
                store=store,
                calls_remaining_floor=100,
            )
        self.assertEqual(store.stored, set())
        self.assertEqual(store.rollbacks, 1)

    def test_do_not_stop_at_exactly_the_floor(self) -> None:
        api = FakeApi(remaining={2027: 100, 2028: 100})
        snapshot(FakeStore(), api)

        self.assertEqual(api.calls, list(CLASSES))


class TheSummary(unittest.TestCase):
    def test_is_json_with_sorted_keys(self) -> None:
        summary = Summary(snapshot_date=DAY, season=2026, calls_made=1, calls_remaining=5)
        summary.classes.append(ClassResult(2027, "stored", 3))

        self.assertEqual(
            json.loads(summary.as_json()),
            {
                "calls_made": 1,
                "calls_remaining": 5,
                "classes": [{"class_year": 2027, "records": 3, "status": "stored"}],
                "error": None,
                "season": 2026,
                "snapshot_date": "2026-09-29",
            },
        )
        self.assertLess(summary.as_json().index("calls_made"), summary.as_json().index("season"))


if __name__ == "__main__":
    unittest.main()
