import unittest
from datetime import date

from ohfootball_rating.publisher import (
    GamePredictionRow,
    RatingSnapshot,
    publish_predictions,
    publish_ratings,
)


def _prediction(
    game_key: str = "g1",
    *,
    team_a_rating: float = 12.0,
    team_b_rating: float = -4.0,
    probability: float = 0.5,
    margin: float = 16.0,
) -> GamePredictionRow:
    return GamePredictionRow(
        game_key=game_key,
        season=2025,
        game_date=date(2025, 9, 5),
        team_a_key="a",
        team_b_key="b",
        team_a_rating=team_a_rating,
        team_b_rating=team_b_rating,
        team_a_win_probability=probability,
        predicted_margin=margin,
        as_of_date=date(2025, 9, 5),
    )


class PublisherContractTests(unittest.TestCase):
    def test_rejects_duplicate_teams(self) -> None:
        snapshot = RatingSnapshot("a", 2026, date(2026, 8, 5), 12.0, 3.0)

        with self.assertRaisesRegex(ValueError, "duplicate teams"):
            publish_ratings("unused", (snapshot, snapshot))

    def test_rejects_multiple_snapshot_dates(self) -> None:
        snapshots = (
            RatingSnapshot("a", 2026, date(2026, 8, 5), 12.0, 3.0),
            RatingSnapshot("b", 2026, date(2026, 8, 6), -4.0, -13.0),
        )

        with self.assertRaisesRegex(ValueError, "one season and as-of date"):
            publish_ratings("unused", snapshots)

    def test_rejects_non_finite_ratings(self) -> None:
        for rating, relative in ((float("nan"), 0.0), (1.0, float("inf"))):
            with self.subTest(rating=rating, relative=relative):
                snapshot = RatingSnapshot("a", 2026, date(2026, 8, 5), rating, relative)
                with self.assertRaisesRegex(ValueError, "finite"):
                    publish_ratings("unused", (snapshot,))

    def test_rejects_an_empty_snapshot_and_an_invalid_schema_name(self) -> None:
        with self.assertRaisesRegex(ValueError, "at least one rating"):
            publish_ratings("unused", ())
        snapshot = RatingSnapshot("a", 2026, date(2026, 8, 5), -12.0, -20.0)
        with self.assertRaisesRegex(ValueError, "invalid marts schema"):
            publish_ratings("unused", (snapshot,), marts_schema="bad schema")


class PredictionPublisherContractTests(unittest.TestCase):
    def test_rejects_an_empty_publication(self) -> None:
        with self.assertRaisesRegex(ValueError, "at least one prediction"):
            publish_predictions("unused", ())

    def test_rejects_duplicate_games(self) -> None:
        prediction = _prediction()

        with self.assertRaisesRegex(ValueError, "duplicate games"):
            publish_predictions("unused", (prediction, prediction))

    def test_rejects_non_finite_ratings_and_margins(self) -> None:
        for prediction in (
            _prediction(team_b_rating=float("inf")),
            _prediction(margin=float("nan")),
        ):
            with self.subTest(prediction=prediction):
                with self.assertRaisesRegex(ValueError, "finite"):
                    publish_predictions("unused", (prediction,))

    def test_rejects_probabilities_outside_the_open_unit_interval(self) -> None:
        for probability in (0.0, 1.0, -0.1, 1.4):
            with self.subTest(probability=probability):
                with self.assertRaisesRegex(ValueError, "between zero and one"):
                    publish_predictions("unused", (_prediction(probability=probability),))

    def test_rejects_an_invalid_schema_name(self) -> None:
        with self.assertRaisesRegex(ValueError, "invalid marts schema"):
            publish_predictions("unused", (_prediction(),), marts_schema="bad schema")


if __name__ == "__main__":
    unittest.main()
