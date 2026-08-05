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


if __name__ == "__main__":
    unittest.main()
