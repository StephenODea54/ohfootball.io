import unittest

from ohfootball_predictor.cli import build_parser


class CommandLineTests(unittest.TestCase):
    def test_parses_parameter_sweep_values_and_windows(self) -> None:
        arguments = build_parser().parse_args(
            [
                "sweep",
                "--parameter",
                "k_factor",
                "--values",
                "16,24,32",
                "--tuning-seasons",
                "2000:2021",
                "--validation-seasons",
                "2022:2023",
            ]
        )

        self.assertEqual(arguments.values, (16.0, 24.0, 32.0))
        self.assertEqual(arguments.tuning_seasons, (2000, 2021))
        self.assertEqual(arguments.validation_seasons, (2022, 2023))

    def test_every_rating_parameter_can_be_swept(self) -> None:
        # The rating scale sets how a rating difference becomes a probability,
        # so it must be tunable together with the K factor.
        for parameter in ("rating_scale", "margin_multiplier_cap"):
            with self.subTest(parameter=parameter):
                arguments = build_parser().parse_args(
                    ["sweep", "--parameter", parameter, "--values", "1.5,2.0"]
                )

                self.assertEqual(arguments.parameter, parameter)
                self.assertEqual(arguments.values, (1.5, 2.0))

    def test_parses_provisional_strategy(self) -> None:
        arguments = build_parser().parse_args(
            [
                "run",
                "--provisional-games",
                "4",
                "--provisional-k-multiplier",
                "1.5",
            ]
        )

        self.assertEqual(arguments.provisional_games, 4)
        self.assertEqual(arguments.provisional_k_multiplier, 1.5)

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
