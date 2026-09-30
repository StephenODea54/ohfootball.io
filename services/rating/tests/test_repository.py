import csv
import tempfile
import unittest
from datetime import date
from pathlib import Path

from ohfootball_rating.repository import _build_query, _game_from_row, load_games_from_export


class RepositoryContractTests(unittest.TestCase):
    def test_does_not_filter_by_state_and_reads_both_state_codes(self) -> None:
        query = _build_query("ohfootball_marts")

        self.assertNotIn("state_code = 'OH'", query)
        self.assertIn("team_a.state_code AS team_a_state_code", query)
        self.assertIn("team_b.state_code AS team_b_state_code", query)

    def test_maps_a_warehouse_row_to_a_game(self) -> None:
        game = _game_from_row(
            {
                "game_key": "g",
                "season": 2025,
                "game_date": date(2025, 8, 22),
                "team_a_key": "a",
                "team_a_program_id": "100",
                "team_a_name": "Alpha",
                "team_a_division": 3,
                "team_a_state_code": "OH",
                "team_b_key": "k",
                "team_b_program_id": "900",
                "team_b_name": "Highlands (KY)",
                "team_b_division": None,
                "team_b_state_code": "REGION 0",
                "team_a_result": "W",
                "is_team_a_home": True,
                "is_team_b_home": False,
                "team_a_score": 21,
                "team_b_score": 14,
                "notes": None,
                "is_playoff_game": False,
            }
        )

        self.assertEqual((game.team_a_state, game.team_b_state), ("OH", "KY"))
        self.assertTrue(game.is_out_of_state_game)
        self.assertEqual((game.team_a_division, game.team_b_program_id), (3, "900"))
        self.assertEqual((game.team_a_score, game.team_b_score), (21, 14))

    def test_leaves_the_choice_of_rateable_games_to_the_game_record(self) -> None:
        query = _build_query("ohfootball_marts")

        self.assertNotIn("game.team_a_result IN", query)
        self.assertNotIn("double forfeit", query)
        self.assertIn("game.notes", query)

    def test_loads_the_playoff_flag(self) -> None:
        self.assertIn("game.is_playoff_game", _build_query("ohfootball_marts"))

    def test_rejects_an_invalid_schema_before_connecting(self) -> None:
        with self.assertRaisesRegex(ValueError, "invalid marts schema"):
            _build_query("ohfootball_marts; DROP SCHEMA")


TEAM_COLUMNS = ("team_key", "season", "source_id", "name", "state_code", "division")
GAME_COLUMNS = (
    "game_key",
    "season",
    "game_date_key",
    "team_a_key",
    "team_b_key",
    "team_a_score",
    "team_b_score",
    "team_a_result",
    "is_team_a_home",
    "is_team_b_home",
    "is_playoff_game",
    "notes",
)


def write_export(folder: Path) -> None:
    teams = (
        ("a", "2025", "100", "Alpha", "OH", "1"),
        ("b", "2025", "200", "Beta", "OH", ""),
        ("w", "2025", "300", "West", "WV", ""),
        ("p", "2025", "400", "Pitt (PA)", "REGION 0", ""),
    )
    games = (
        ("g1", "2025", "20250822", "a", "b", "28", "7", "W", "1", "0", "0", ""),
        ("g2", "2025", "20250829", "a", "w", "14", "0", "W", "0", "1", "0", ""),
        ("g3", "2025", "20250905", "a", "gone", "", "", "unknown", "0", "0", "0", ""),
        ("g4", "2025", "20250912", "w", "p", "7", "3", "W", "1", "0", "0", ""),
    )
    for name, columns, rows in (
        ("dim_teams.csv", TEAM_COLUMNS, teams),
        ("fct_games.csv", GAME_COLUMNS, games),
    ):
        with (folder / name).open("w", encoding="utf-8", newline="") as target:
            writer = csv.writer(target)
            writer.writerow(columns)
            writer.writerows(rows)


class ExportLoaderTests(unittest.TestCase):
    def test_keeps_every_game_with_an_ohio_team_and_labels_the_states(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            write_export(Path(folder))
            games = load_games_from_export(folder)

        self.assertEqual([game.game_key for game in games], ["g1", "g2"])
        ohio, other = games
        self.assertTrue(ohio.is_ohio_game)
        self.assertEqual((other.team_a_state, other.team_b_state), ("OH", "WV"))
        self.assertTrue(other.is_out_of_state_game)

    def test_reads_games_between_ohio_teams_the_same_way_as_the_warehouse(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            write_export(Path(folder))
            games = load_games_from_export(folder)

        only = games[0]
        self.assertEqual(only.game_key, "g1")
        self.assertEqual(only.game_date, date(2025, 8, 22))
        self.assertEqual((only.team_a_program_id, only.team_b_program_id), ("100", "200"))
        self.assertEqual((only.team_a_name, only.team_b_name), ("Alpha", "Beta"))
        self.assertEqual((only.team_a_division, only.team_b_division), (1, None))
        self.assertEqual((only.team_a_score, only.team_b_score), (28, 7))
        self.assertTrue(only.is_team_a_home)
        self.assertFalse(only.is_team_b_home)
        self.assertFalse(only.is_playoff_game)
        self.assertIsNone(only.notes)
        self.assertEqual(only.team_a_result, "W")


if __name__ == "__main__":
    unittest.main()
