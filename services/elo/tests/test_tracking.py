import sys
import unittest
from datetime import date
from unittest import mock

from ohfootball_elo.elo import EloConfig
from ohfootball_elo.tracking import track_run


class TheTrackingServer(unittest.TestCase):
    def test_is_reported_as_missing_rather_than_failing_on_the_import(self) -> None:
        # A name set to None in the module table makes the import of that name fail, which is what
        # an installation without the tracking extra does.
        with mock.patch.dict(sys.modules, {"mlflow": None}):
            with self.assertRaises(SystemExit) as stopped:
                track_run(
                    tracking_uri="http://localhost:5000",
                    experiment_name="ohfootball-elo",
                    run_name=None,
                    as_of_date=date(2025, 8, 1),
                    config=EloConfig(),
                    training_games=(),
                    historical_predictions=(),
                    upcoming_predictions=(),
                    ratings={},
                )

        self.assertIn("tracking extra", str(stopped.exception))


if __name__ == "__main__":
    unittest.main()
