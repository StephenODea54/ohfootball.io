import unittest

from ohfootball_rating.cli import build_parser


class CommandLineTests(unittest.TestCase):
    def test_publish_uses_production_strategy(self) -> None:
        arguments = build_parser().parse_args(["publish", "--season", "2026"])

        self.assertEqual(arguments.season, 2026)
        self.assertEqual(arguments.k_factor, 148)
        self.assertEqual(arguments.home_advantage, 30)
        self.assertEqual(arguments.season_carryover, 0.85)
        self.assertEqual(arguments.division_rating_step, 140)
        self.assertEqual(arguments.provisional_games, 3)
        self.assertEqual(arguments.provisional_k_multiplier, 1.6)


if __name__ == "__main__":
    unittest.main()
