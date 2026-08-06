import unittest
from datetime import date

from ohfootball_predictor.publisher import RatingSnapshot, publish_ratings


class PublisherContractTests(unittest.TestCase):
    def test_rejects_duplicate_teams(self) -> None:
        snapshot = RatingSnapshot("a", 2026, date(2026, 8, 5), 1500)

        with self.assertRaisesRegex(ValueError, "duplicate teams"):
            publish_ratings("unused", (snapshot, snapshot))

    def test_rejects_multiple_snapshot_dates(self) -> None:
        snapshots = (
            RatingSnapshot("a", 2026, date(2026, 8, 5), 1500),
            RatingSnapshot("b", 2026, date(2026, 8, 6), 1500),
        )

        with self.assertRaisesRegex(ValueError, "one season and as-of date"):
            publish_ratings("unused", snapshots)

    def test_rejects_non_finite_ratings(self) -> None:
        snapshot = RatingSnapshot("a", 2026, date(2026, 8, 5), float("nan"))

        with self.assertRaisesRegex(ValueError, "finite"):
            publish_ratings("unused", (snapshot,))


if __name__ == "__main__":
    unittest.main()
