import unittest
from dataclasses import replace
from datetime import date, timedelta
from math import exp, log
from random import Random

from ohfootball_rating.games import Game
from ohfootball_rating.margin import (
    PLAYOFF_BUCKET,
    PROBABILITY_FLOOR,
    MarginConfig,
    MarginPrediction,
    backtest,
    bucket,
    fit_slope,
    fit_slopes,
    opening_rating,
    predict,
    win_probability,
)
from ohfootball_rating.metrics import evaluate

CONFIG = MarginConfig()


def game(
    game_key: str,
    game_date: date,
    team_a: str,
    team_b: str,
    result: str,
    *,
    season: int = 2025,
    scores: tuple[int, int] | None = None,
    team_a_program_id: str | None = None,
    team_b_program_id: str | None = None,
    team_a_division: int | None = None,
    team_b_division: int | None = None,
    is_team_a_home: bool = False,
    is_team_b_home: bool = False,
    is_playoff_game: bool = False,
    notes: str | None = None,
) -> Game:
    return Game(
        game_key=game_key,
        season=season,
        game_date=game_date,
        team_a_key=team_a,
        team_a_name=team_a,
        team_b_key=team_b,
        team_b_name=team_b,
        team_a_result=result,
        team_a_program_id=team_a_program_id,
        team_b_program_id=team_b_program_id,
        team_a_division=team_a_division,
        team_b_division=team_b_division,
        is_team_a_home=is_team_a_home,
        is_team_b_home=is_team_b_home,
        team_a_score=scores[0] if scores else None,
        team_b_score=scores[1] if scores else None,
        notes=notes,
        is_playoff_game=is_playoff_game,
    )


def sigmoid(value: float) -> float:
    return 1.0 / (1.0 + exp(-value))


def prediction(season: int, margin: float, result: float | None, group: str) -> MarginPrediction:
    return MarginPrediction(
        game_key=f"{season}-{margin}-{result}",
        season=season,
        game_date=date(season, 9, 1),
        team_a_key="a",
        team_a_name="a",
        team_b_key="b",
        team_b_name="b",
        team_a_rating=0.0,
        team_b_rating=0.0,
        predicted_margin=margin,
        team_a_win_probability=0.5,
        actual_team_a_score=result,
        actual_margin=None,
        bucket=group,
        slope=0.1,
        is_team_a_home=False,
        is_team_b_home=False,
        is_playoff_game=False,
        team_a_games_played=0,
        team_b_games_played=0,
    )


# Four wins and two losses at a margin of 1, and the mirror image at a margin of -1. The slope
# that fits these rows is ln 2, because it gives team A a 2/3 chance at a margin of 1.
LN2_ROWS = [(1.0, 1.0), (1.0, 1.0), (1.0, 0.0), (-1.0, 0.0), (-1.0, 0.0), (-1.0, 1.0)]


def league(seasons: range) -> list[Game]:
    """Give six teams that play each other one time a season.

    A seeded random draw sets the scores. Stronger teams tend to win by more, but upsets happen,
    so every group of games holds wins and losses at many margins. The last week is a playoff.
    """
    draw = Random(7)
    strength = {"a": 14, "b": 7, "c": 3, "d": 0, "e": -6, "f": -12}
    rounds = (
        (("a", "b"), ("c", "d"), ("e", "f")),
        (("a", "c"), ("b", "e"), ("d", "f")),
        (("a", "d"), ("b", "f"), ("c", "e")),
        (("a", "e"), ("b", "d"), ("c", "f")),
        (("a", "f"), ("b", "c"), ("d", "e")),
    )
    games: list[Game] = []
    for season in seasons:
        for week, pairs in enumerate(rounds):
            for team_a, team_b in pairs:
                margin = round(strength[team_a] - strength[team_b] + draw.gauss(0, 14))
                points_b = draw.randint(0, 28)
                points_a = max(0, points_b + margin)
                result = "W" if points_a > points_b else "L" if points_a < points_b else "T"
                games.append(
                    game(
                        f"{season}-{week}-{team_a}{team_b}",
                        date(season, 8, 22) + timedelta(days=7 * week),
                        team_a,
                        team_b,
                        result,
                        season=season,
                        scores=(points_a, points_b),
                        team_a_program_id=team_a,
                        team_b_program_id=team_b,
                        is_team_a_home=draw.random() < 0.5,
                        is_playoff_game=week == len(rounds) - 1,
                    )
                )
    return games


class ConfigTests(unittest.TestCase):
    def test_rejects_each_value_outside_its_range(self) -> None:
        cases = {
            "home_edge": -1.0,
            "margin_cap": 0.0,
            "learning_rate": 0.0,
            "learning_offset": 0.0,
            "division_step": -1.0,
            "carryover_last": 1.5,
            "carryover_older": -0.1,
            "history_seasons": 0,
            "slope_seasons": 0,
            "bucket_games": -1,
            "fallback_slope": 0.0,
        }
        for field, value in cases.items():
            with self.subTest(field=field):
                with self.assertRaises(ValueError):
                    MarginConfig(**{field: value})

    def test_rejects_carryover_shares_that_add_up_to_more_than_one(self) -> None:
        with self.assertRaises(ValueError):
            MarginConfig(carryover_last=0.9, carryover_older=0.2)

    def test_the_learning_weight_falls_with_each_scored_game(self) -> None:
        self.assertAlmostEqual(CONFIG.learning_weight(0), 0.33)
        self.assertAlmostEqual(CONFIG.learning_weight(3), 1.65 / 8)
        self.assertAlmostEqual(CONFIG.learning_weight(10), 0.11)

    def test_clip_margin_keeps_a_margin_inside_the_cap(self) -> None:
        self.assertEqual(CONFIG.clip_margin(70), 56)
        self.assertEqual(CONFIG.clip_margin(-70), -56)
        self.assertEqual(CONFIG.clip_margin(3), 3)
        self.assertEqual(MarginConfig(margin_cap=10).clip_margin(12), 10)


class WinProbabilityTests(unittest.TestCase):
    def test_an_even_game_is_even(self) -> None:
        self.assertEqual(win_probability(0.0, 0.1), 0.5)

    def test_the_curve_is_symmetric(self) -> None:
        self.assertAlmostEqual(win_probability(7.0, 0.1) + win_probability(-7.0, 0.1), 1.0)
        self.assertAlmostEqual(win_probability(7.0, 0.1), sigmoid(0.7))

    def test_a_huge_margin_stays_inside_the_limits(self) -> None:
        self.assertEqual(win_probability(10_000.0, 1.0), 1.0 - PROBABILITY_FLOOR)
        self.assertEqual(win_probability(-10_000.0, 1.0), PROBABILITY_FLOOR)


class BucketTests(unittest.TestCase):
    def test_a_playoff_game_has_its_own_group(self) -> None:
        self.assertEqual(bucket(0, 9, True, CONFIG), PLAYOFF_BUCKET)

    def test_the_team_with_fewer_games_picks_the_group(self) -> None:
        self.assertEqual(bucket(0, 5, False, CONFIG), "games_0")
        self.assertEqual(bucket(4, 2, False, CONFIG), "games_2")

    def test_the_group_number_stops_at_the_limit(self) -> None:
        self.assertEqual(bucket(9, 7, False, CONFIG), "games_6")
        self.assertEqual(bucket(9, 7, False, MarginConfig(bucket_games=3)), "games_3")


class OpeningRatingTests(unittest.TestCase):
    def test_a_new_program_starts_at_its_division_prior(self) -> None:
        for division, expected in ((1, 36.0), (4, 0.0), (7, -36.0), (None, 0.0)):
            with self.subTest(division=division):
                self.assertEqual(
                    opening_rating(
                        season=2025,
                        program_id="new",
                        division=division,
                        program_history={},
                        config=CONFIG,
                    ),
                    expected,
                )

    def test_a_returning_program_mixes_its_last_season_with_the_seasons_before(self) -> None:
        history = {"p": {2016: 90.0, 2020: 10.0, 2022: 20.0, 2024: 40.0}}

        rating = opening_rating(
            season=2025, program_id="p", division=2, program_history=history, config=CONFIG
        )

        # 2016 through 2023 hold 90, 10 and 20, whose mean is 40. The prior cancels.
        self.assertAlmostEqual(rating, 0.8 * 40.0 + 0.2 * 40.0)

    def test_the_older_seasons_are_the_eight_before_the_last(self) -> None:
        history = {"p": {2015: 1000.0, 2016: 30.0, 2024: 10.0}}

        rating = opening_rating(
            season=2025, program_id="p", division=4, program_history=history, config=CONFIG
        )

        self.assertAlmostEqual(rating, 0.8 * 10.0 + 0.2 * 30.0)

    def test_the_last_season_stands_in_when_no_older_season_exists(self) -> None:
        history = {"p": {2024: 10.0}}

        rating = opening_rating(
            season=2025, program_id="p", division=4, program_history=history, config=CONFIG
        )

        self.assertAlmostEqual(rating, 10.0)

    def test_a_program_back_from_an_absence_starts_from_its_last_season(self) -> None:
        history = {"p": {2019: 10.0}}

        rating = opening_rating(
            season=2025, program_id="p", division=4, program_history=history, config=CONFIG
        )

        self.assertAlmostEqual(rating, 10.0)

    def test_the_season_itself_and_later_seasons_are_not_history(self) -> None:
        history = {"p": {2025: 50.0, 2026: 70.0}}

        rating = opening_rating(
            season=2025, program_id="p", division=3, program_history=history, config=CONFIG
        )

        self.assertEqual(rating, 12.0)

    def test_the_prior_counts_when_the_carryover_shares_leave_room(self) -> None:
        config = MarginConfig(carryover_last=0.5, carryover_older=0.0)
        history = {"p": {2024: 10.0}}

        rating = opening_rating(
            season=2025, program_id="p", division=1, program_history=history, config=config
        )

        self.assertAlmostEqual(rating, 36.0 + 0.5 * (10.0 - 36.0))


class FitSlopeTests(unittest.TestCase):
    def test_finds_the_slope_of_known_rows(self) -> None:
        self.assertAlmostEqual(fit_slope(LN2_ROWS, fallback=0.1), log(2), places=9)

    def test_ties_count_as_half_a_win(self) -> None:
        rows = [*LN2_ROWS, (1.0, 0.5), (-1.0, 0.5)]

        self.assertLess(fit_slope(rows, fallback=0.1), log(2))

    def test_uses_the_fallback_when_the_rows_cannot_give_a_slope(self) -> None:
        cases = {
            "no rows": [],
            "only wins": [(1.0, 1.0), (-1.0, 1.0)],
            "only ties": [(1.0, 0.5), (-1.0, 0.5)],
            "no margin": [(0.0, 1.0), (0.0, 0.0)],
            "separable": [(7.0, 1.0), (-7.0, 0.0), (3.0, 1.0), (-3.0, 0.0)],
            "the favorite loses": [(1.0, 0.0), (1.0, 0.0), (1.0, 1.0), (-1.0, 1.0)] * 2,
        }
        for name, rows in cases.items():
            with self.subTest(case=name):
                self.assertEqual(fit_slope(rows, fallback=0.1), 0.1)

    def test_uses_the_fallback_when_the_fit_does_not_converge(self) -> None:
        self.assertEqual(fit_slope(LN2_ROWS, fallback=0.1, iterations=1), 0.1)

    def test_the_fit_does_not_depend_on_the_fallback(self) -> None:
        for fallback in (0.01, 0.5, 5.0):
            with self.subTest(fallback=fallback):
                self.assertAlmostEqual(fit_slope(LN2_ROWS, fallback=fallback), log(2), places=9)

    def test_finds_a_slope_near_the_one_that_made_the_rows(self) -> None:
        draw = Random(3)
        rows = []
        for _ in range(4000):
            margin = draw.uniform(-30, 30)
            rows.append((margin, 1.0 if draw.random() < sigmoid(0.12 * margin) else 0.0))

        self.assertAlmostEqual(fit_slope(rows, fallback=0.1), 0.12, delta=0.01)


class FitSlopesTests(unittest.TestCase):
    def test_uses_only_the_window_of_seasons_before_the_season(self) -> None:
        rows = [
            prediction(season, margin, result, "games_0")
            for season in range(2001, 2011)
            for margin, result in LN2_ROWS
        ]
        # A separable season just outside the window must change nothing.
        rows += [prediction(2000, margin, result, "games_0") for margin, result in LN2_ROWS[:2]]
        rows += [prediction(2000, -1.0, 0.0, "games_0")]
        rows += [prediction(2011, 1.0, 0.0, "games_0")]

        slopes = fit_slopes(rows, 2011, CONFIG)

        self.assertEqual(set(slopes), {"games_0"})
        self.assertAlmostEqual(slopes["games_0"], log(2), places=9)
        self.assertNotAlmostEqual(fit_slopes(rows, 2010, CONFIG)["games_0"], log(2), places=6)
        self.assertEqual(fit_slopes(rows, 2000, CONFIG), {})

    def test_skips_predictions_without_a_result(self) -> None:
        rows = [prediction(2010, 1.0, None, "games_0")]

        self.assertEqual(fit_slopes(rows, 2011, CONFIG), {})

    def test_fits_each_group_on_its_own(self) -> None:
        rows = [prediction(2010, m, y, "games_0") for m, y in LN2_ROWS]
        rows += [prediction(2010, m, y, PLAYOFF_BUCKET) for m, y in LN2_ROWS[:2]]

        slopes = fit_slopes(rows, 2011, CONFIG)

        self.assertAlmostEqual(slopes["games_0"], log(2), places=9)
        self.assertEqual(slopes[PLAYOFF_BUCKET], CONFIG.fallback_slope)


class BacktestTests(unittest.TestCase):
    def test_predicts_before_the_game_then_moves_both_ratings(self) -> None:
        result = backtest(
            [game("one", date(2025, 8, 22), "a", "b", "W", scores=(28, 7), is_team_a_home=True)]
        )

        (only,) = result.predictions
        self.assertEqual(only.predicted_margin, 1.5)
        self.assertEqual(only.slope, CONFIG.fallback_slope)
        self.assertAlmostEqual(only.team_a_win_probability, sigmoid(0.15))
        self.assertEqual(only.bucket, "games_0")
        self.assertEqual(only.actual_margin, 21)
        self.assertEqual(only.actual_team_a_score, 1.0)
        self.assertAlmostEqual(result.ratings[(2025, "a")], 0.33 * 19.5)
        self.assertAlmostEqual(result.ratings[(2025, "b")], -0.33 * 19.5)
        self.assertEqual(result.games_played, {(2025, "a"): 1, (2025, "b"): 1})
        self.assertEqual(result.scored_games, {(2025, "a"): 1, (2025, "b"): 1})
        self.assertEqual(result.slopes, {2025: {}})

    def test_the_home_edge_follows_the_home_team(self) -> None:
        for home_a, home_b, expected in (
            (True, False, 1.5),
            (False, True, -1.5),
            (False, False, 0),
        ):
            with self.subTest(home_a=home_a, home_b=home_b):
                (only,) = backtest(
                    [
                        game(
                            "one",
                            date(2025, 8, 22),
                            "a",
                            "b",
                            "W",
                            scores=(7, 0),
                            is_team_a_home=home_a,
                            is_team_b_home=home_b,
                        )
                    ]
                ).predictions
                self.assertEqual(only.predicted_margin, expected)

    def test_games_on_one_date_use_the_ratings_of_the_start_of_the_date(self) -> None:
        day = date(2025, 8, 22)
        result = backtest(
            [
                game("one", day, "a", "b", "W", scores=(14, 0)),
                game("two", day, "a", "c", "W", scores=(14, 0)),
            ]
        )

        self.assertEqual(result.predictions[1].predicted_margin, 0.0)
        self.assertEqual(result.predictions[1].team_a_games_played, 0)
        self.assertAlmostEqual(result.ratings[(2025, "a")], 2 * 0.33 * 14)
        self.assertEqual(result.games_played[(2025, "a")], 2)

    def test_each_team_moves_by_its_own_learning_weight(self) -> None:
        result = backtest(
            [
                game("one", date(2025, 8, 22), "a", "b", "W", scores=(10, 0)),
                game("two", date(2025, 8, 29), "a", "c", "W", scores=(10, 0)),
            ]
        )

        rating_a = 0.33 * 10
        surprise = 10 - rating_a
        self.assertAlmostEqual(result.ratings[(2025, "a")], rating_a + 1.65 / 6 * surprise)
        self.assertAlmostEqual(result.ratings[(2025, "c")], -0.33 * surprise)

    def test_the_margin_is_clipped_at_the_cap_on_both_sides(self) -> None:
        for scores, margin in (((70, 0), 56), ((0, 70), -56)):
            with self.subTest(scores=scores):
                result = backtest([game("one", date(2025, 8, 22), "a", "b", "W", scores=scores)])
                self.assertAlmostEqual(result.ratings[(2025, "a")], 0.33 * margin)
                self.assertEqual(result.predictions[0].actual_margin, scores[0] - scores[1])

    def test_the_expected_margin_is_clipped_at_the_cap_too(self) -> None:
        # A new division 1 program opens at 36 and a new division 7 program at -36, so the
        # expected margin is 72, more than the cap of 56.
        for scores, change in (((70, 0), 0.0), ((40, 0), 0.33 * (40 - 56)), ((0, 70), 0.33 * -112)):
            with self.subTest(scores=scores):
                result = backtest(
                    [
                        game(
                            "one",
                            date(2025, 8, 22),
                            "a",
                            "b",
                            "W" if scores[0] > scores[1] else "L",
                            scores=scores,
                            team_a_division=1,
                            team_b_division=7,
                        )
                    ]
                )

                self.assertEqual(result.predictions[0].predicted_margin, 72.0)
                self.assertAlmostEqual(result.ratings[(2025, "a")], 36.0 + change)
                self.assertAlmostEqual(result.ratings[(2025, "b")], -36.0 - change)

    def test_the_expected_margin_is_clipped_for_the_underdog_too(self) -> None:
        result = backtest(
            [
                game(
                    "one",
                    date(2025, 8, 22),
                    "b",
                    "a",
                    "L",
                    scores=(0, 70),
                    team_a_division=7,
                    team_b_division=1,
                )
            ]
        )

        self.assertEqual(result.predictions[0].predicted_margin, -72.0)
        self.assertAlmostEqual(result.ratings[(2025, "b")], -36.0)
        self.assertAlmostEqual(result.ratings[(2025, "a")], 36.0)

    def test_a_tie_scores_half_a_win_and_a_margin_of_zero(self) -> None:
        (only,) = backtest(
            [game("one", date(2025, 8, 22), "a", "b", "T", scores=(14, 14))]
        ).predictions

        self.assertEqual(only.actual_team_a_score, 0.5)
        self.assertEqual(only.actual_margin, 0)

    def test_a_game_without_scores_is_predicted_but_moves_no_rating(self) -> None:
        result = backtest([game("one", date(2024, 8, 22), "a", "b", "W", season=2024)])

        (only,) = result.predictions
        self.assertEqual(only.team_a_win_probability, 0.5)
        self.assertEqual(only.actual_team_a_score, 1.0)
        self.assertIsNone(only.actual_margin)
        self.assertEqual(result.ratings, {(2024, "a"): 0.0, (2024, "b"): 0.0})
        self.assertEqual(result.games_played, {(2024, "a"): 1, (2024, "b"): 1})
        self.assertEqual(result.scored_games, {})
        self.assertEqual(result.program_history, {"a": {2024: 0.0}, "b": {2024: 0.0}})

    def test_a_forfeit_and_a_canceled_game_are_not_rated(self) -> None:
        result = backtest(
            [
                game("one", date(2025, 8, 22), "a", "b", "W", scores=(1, 0), notes="forfeit"),
                game("two", date(2025, 8, 29), "a", "b", "C"),
            ]
        )

        self.assertEqual(result.predictions, ())
        self.assertEqual(result.ratings, {})

    def test_a_program_carries_its_rating_into_the_next_season(self) -> None:
        result = backtest(
            [
                game(
                    "one",
                    date(2024, 8, 22),
                    "a24",
                    "b24",
                    "W",
                    season=2024,
                    scores=(28, 7),
                    team_a_program_id="a",
                    team_b_program_id="b",
                ),
                game(
                    "two",
                    date(2025, 8, 22),
                    "a25",
                    "new",
                    "W",
                    scores=(7, 0),
                    team_a_program_id="a",
                    team_b_division=1,
                ),
            ]
        )

        second = result.predictions[1]
        self.assertAlmostEqual(second.team_a_rating, 0.33 * 21)
        self.assertEqual(second.team_b_rating, 36.0)
        self.assertEqual(set(result.program_history["a"]), {2024, 2025})
        self.assertAlmostEqual(result.program_history["a"][2024], 0.33 * 21)
        self.assertEqual(result.program_history["a"][2025], result.ratings[(2025, "a25")])
        self.assertIn("new", result.program_history)

    def test_the_slopes_of_a_season_come_from_the_seasons_before_it(self) -> None:
        result = backtest(league(range(2000, 2013)))

        self.assertEqual(result.slopes[2000], {})
        self.assertEqual(
            set(result.slopes[2012]), {"games_0", "games_1", "games_2", "games_3", PLAYOFF_BUCKET}
        )
        for season in (2005, 2012):
            for name, slope in result.slopes[season].items():
                with self.subTest(season=season, bucket=name):
                    self.assertNotEqual(slope, CONFIG.fallback_slope)
        self.assertNotEqual(result.slopes[2005]["games_1"], result.slopes[2012]["games_1"])
        self.assertEqual(result.slopes[2012], fit_slopes(result.predictions, 2012, CONFIG))
        for item in result.predictions:
            with self.subTest(game=item.game_key):
                expected = result.slopes[item.season].get(item.bucket, CONFIG.fallback_slope)
                self.assertEqual(item.slope, expected)
                self.assertAlmostEqual(
                    item.team_a_win_probability, win_probability(item.predicted_margin, expected)
                )

    def test_no_game_can_change_its_own_prediction_or_an_earlier_one(self) -> None:
        games = league(range(2000, 2013))
        original = {item.game_key: item for item in backtest(games).predictions}
        for index in (3, 40, len(games) - 20):
            target = games[index]
            flipped = replace(target, team_a_score=0, team_b_score=60, team_a_result="L")
            with self.subTest(game=target.game_key):
                changed = {
                    item.game_key: item
                    for item in backtest([*games[:index], flipped, *games[index + 1 :]]).predictions
                }
                cutoff = (target.season, target.game_date)
                later_changed = False
                for key, item in original.items():
                    before = replace(item, actual_team_a_score=None, actual_margin=None)
                    after = replace(changed[key], actual_team_a_score=None, actual_margin=None)
                    if (item.season, item.game_date) <= cutoff:
                        self.assertEqual(before, after)
                    elif before != after:
                        later_changed = True
                self.assertTrue(later_changed)

    def test_the_default_config_is_used_when_none_is_given(self) -> None:
        games = league(range(2000, 2002))

        self.assertEqual(backtest(games), backtest(games, CONFIG))

    def test_its_predictions_can_be_scored(self) -> None:
        evaluation = evaluate(backtest(league(range(2000, 2003))).predictions)

        self.assertEqual(evaluation.games, 45)

    def test_a_game_without_scores_counts_for_the_group_but_not_for_the_weight(self) -> None:
        result = backtest(
            [
                game("one", date(2025, 8, 22), "a", "b", "W"),
                game("two", date(2025, 8, 29), "a", "c", "W", scores=(10, 0)),
            ]
        )

        second = result.predictions[1]
        self.assertEqual(second.team_a_games_played, 1)
        self.assertEqual(second.bucket, "games_0")
        self.assertAlmostEqual(result.ratings[(2025, "a")], 0.33 * 10)
        self.assertEqual(result.scored_games[(2025, "a")], 1)

    def test_a_game_without_scores_keeps_the_opening_rating_of_a_returning_team(self) -> None:
        result = backtest(
            [
                game(
                    "one",
                    date(2024, 8, 22),
                    "a24",
                    "b24",
                    "W",
                    season=2024,
                    scores=(28, 7),
                    team_a_program_id="a",
                    team_b_program_id="b",
                ),
                game(
                    "two",
                    date(2025, 8, 22),
                    "a25",
                    "b25",
                    "W",
                    team_a_program_id="a",
                    team_b_program_id="b",
                ),
            ]
        )

        self.assertAlmostEqual(result.ratings[(2025, "a25")], 0.33 * 21)
        self.assertAlmostEqual(result.program_history["a"][2025], 0.33 * 21)


class PredictTests(unittest.TestCase):
    def setUp(self) -> None:
        self.result = backtest(
            [
                game(
                    "one",
                    date(2025, 8, 22),
                    "a",
                    "b",
                    "W",
                    scores=(28, 7),
                    team_a_program_id="a",
                    team_b_program_id="b",
                )
            ]
        )

    def test_uses_the_current_ratings_and_changes_none(self) -> None:
        (upcoming,) = predict(
            [game("two", date(2025, 8, 29), "a", "c", "unknown", is_team_a_home=True)],
            self.result,
        )

        self.assertAlmostEqual(upcoming.team_a_rating, 0.33 * 21)
        self.assertEqual(upcoming.team_b_rating, 0.0)
        self.assertAlmostEqual(upcoming.predicted_margin, 0.33 * 21 + 1.5)
        self.assertEqual(upcoming.bucket, "games_0")
        self.assertEqual(upcoming.team_a_games_played, 1)
        self.assertIsNone(upcoming.actual_team_a_score)
        self.assertIsNone(upcoming.actual_margin)
        self.assertEqual(upcoming.slope, CONFIG.fallback_slope)
        self.assertAlmostEqual(self.result.ratings[(2025, "a")], 0.33 * 21)

    def test_a_team_in_a_new_season_opens_from_its_program_history(self) -> None:
        (upcoming,) = predict(
            [
                game(
                    "two",
                    date(2026, 8, 21),
                    "a26",
                    "b26",
                    "unknown",
                    season=2026,
                    team_a_program_id="a",
                    team_b_program_id="b",
                )
            ],
            self.result,
        )

        self.assertAlmostEqual(upcoming.team_a_rating, 0.33 * 21)
        self.assertAlmostEqual(upcoming.team_b_rating, -0.33 * 21)
        self.assertEqual(upcoming.team_a_games_played, 0)

    def test_games_of_one_season_share_its_slopes(self) -> None:
        result = backtest(league(range(2000, 2013)))
        first, second = predict(
            [
                game(
                    "x", date(2012, 12, 1), "a", "b", "unknown", season=2012, is_playoff_game=True
                ),
                game(
                    "y", date(2012, 12, 8), "c", "d", "unknown", season=2012, is_playoff_game=True
                ),
            ],
            result,
        )

        self.assertEqual(first.slope, result.slopes[2012][PLAYOFF_BUCKET])
        self.assertEqual(second.slope, result.slopes[2012][PLAYOFF_BUCKET])

    def test_a_playoff_game_uses_the_playoff_group(self) -> None:
        (upcoming,) = predict(
            [game("two", date(2025, 11, 7), "a", "b", "unknown", is_playoff_game=True)],
            self.result,
        )

        self.assertEqual(upcoming.bucket, PLAYOFF_BUCKET)

    def test_reuses_the_slopes_of_a_backtested_season_and_fits_a_new_season(self) -> None:
        result = backtest(league(range(2000, 2013)))
        in_season = game(
            "x", date(2012, 12, 1), "a", "b", "unknown", season=2012, is_playoff_game=True
        )
        next_season = game("y", date(2013, 8, 23), "a", "b", "unknown", season=2013)

        first, second = predict([in_season, next_season], result)

        self.assertEqual(first.slope, result.slopes[2012][PLAYOFF_BUCKET])
        self.assertEqual(second.bucket, "games_0")
        self.assertEqual(second.slope, fit_slopes(result.predictions, 2013, CONFIG)["games_0"])
        self.assertNotEqual(second.slope, CONFIG.fallback_slope)


if __name__ == "__main__":
    unittest.main()
