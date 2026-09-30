import unittest
from datetime import date

from ohfootball_rating.games import Game, chronological


def game(
    result: str,
    *,
    notes: str | None = None,
    game_key: str = "key",
    season: int = 2025,
    game_date: date = date(2025, 8, 1),
) -> Game:
    return Game(
        game_key=game_key,
        season=season,
        game_date=game_date,
        team_a_key="a",
        team_a_name="A",
        team_b_key="b",
        team_b_name="B",
        team_a_result=result,
        notes=notes,
    )


class RateableScoreTests(unittest.TestCase):
    def test_every_result_and_note_maps_to_one_score(self) -> None:
        cases = (
            ("W", None, 1.0),
            ("T", None, 0.5),
            ("L", None, 0.0),
            ("C", None, None),
            ("unknown", None, None),
            ("W", "overtime", 1.0),
            ("T", "overtime", 0.5),
            ("W", "forfeit", None),
            ("L", "forfeit", None),
            ("L", "double forfeit", None),
            ("unknown", "canceled", None),
        )

        for result, notes, expected in cases:
            with self.subTest(result=result, notes=notes):
                self.assertEqual(game(result, notes=notes).rateable_score, expected)

    def test_a_forfeit_note_is_matched_without_case_or_padding(self) -> None:
        self.assertTrue(game("W", notes="  Forfeit ").is_forfeit)
        self.assertIsNone(game("W", notes="  Forfeit ").rateable_score)

    def test_is_rateable_agrees_with_the_score(self) -> None:
        self.assertTrue(game("T").is_rateable)
        self.assertFalse(game("W", notes="forfeit").is_rateable)
        self.assertFalse(game("C").is_rateable)

    def test_a_canceled_game_is_not_a_scheduled_game(self) -> None:
        self.assertTrue(game("C").is_canceled)
        self.assertFalse(game("C").is_scheduled)
        self.assertTrue(game("unknown").is_scheduled)
        self.assertFalse(game("unknown").is_canceled)

    def test_a_game_is_not_a_playoff_game_unless_marked(self) -> None:
        self.assertFalse(game("W").is_playoff_game)


class ChronologicalTests(unittest.TestCase):
    def test_the_season_is_sorted_before_the_date(self) -> None:
        # A rating carries between seasons, so an early date in a later season
        # must never sort before a late date in an earlier season.
        late_2024 = game("W", game_key="late", season=2024, game_date=date(2024, 12, 1))
        early_2025 = game("W", game_key="early", season=2025, game_date=date(2025, 8, 1))

        ordered = chronological((early_2025, late_2024))

        self.assertEqual([item.game_key for item in ordered], ["late", "early"])

    def test_games_on_one_date_are_ordered_by_key(self) -> None:
        second = game("W", game_key="b")
        first = game("W", game_key="a")

        ordered = chronological((second, first))

        self.assertEqual([item.game_key for item in ordered], ["a", "b"])


class StateTests(unittest.TestCase):
    def test_tells_a_game_between_ohio_teams_from_one_against_another_state(self) -> None:
        cases = (
            (("OH", "OH"), (True, False)),
            (("OH", "WV"), (False, True)),
            (("WV", "OH"), (False, True)),
            (("WV", "PA"), (False, False)),
        )
        for (state_a, state_b), expected in cases:
            with self.subTest(states=(state_a, state_b)):
                record = Game(
                    game_key="g",
                    season=2025,
                    game_date=date(2025, 8, 1),
                    team_a_key="a",
                    team_a_name="A",
                    team_b_key="b",
                    team_b_name="B",
                    team_a_result="W",
                    team_a_state=state_a,
                    team_b_state=state_b,
                )
                self.assertEqual((record.is_ohio_game, record.is_out_of_state_game), expected)

    def test_a_team_is_an_ohio_team_by_default(self) -> None:
        self.assertTrue(game("W").is_ohio_game)


if __name__ == "__main__":
    unittest.main()
