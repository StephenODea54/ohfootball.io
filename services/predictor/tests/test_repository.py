import unittest

from ohfootball_predictor.repository import _build_query


class RepositoryContractTests(unittest.TestCase):
    def test_only_loads_games_between_ohsaa_teams(self) -> None:
        query = _build_query("ohfootball_marts")

        self.assertIn("team_a.state_code = 'OH'", query)
        self.assertIn("team_b.state_code = 'OH'", query)
        self.assertIn("COALESCE(game.notes, '') <> 'double forfeit'", query)

    def test_rejects_an_invalid_schema_before_connecting(self) -> None:
        with self.assertRaisesRegex(ValueError, "invalid marts schema"):
            _build_query("ohfootball_marts; DROP SCHEMA")


if __name__ == "__main__":
    unittest.main()
