import types
import unittest
from collections import Counter
from dataclasses import replace
from datetime import date
from unittest.mock import patch

import numpy as np
from season_fixture import LAST_DAY, OTHER, SEASON, WEEK_ONE, make_league

from ohfootball_rating import simulation
from ohfootball_rating.games import Game
from ohfootball_rating.harbin import (
    HarbinGame,
    HarbinTeam,
    PlayoffFormat,
    counted_games,
    playoff_format,
    seed_region,
    standings,
)
from ohfootball_rating.margin import MarginConfig
from ohfootball_rating.simulation import (
    UNKNOWN_GAME_WIN_SHARE,
    _errors,
    bracket_order,
    build_setup,
    harbin_points,
    season_games,
    simulate,
)

CONFIG = MarginConfig()


def constant_error(setup, value: float):
    """Give every game the same error, seen from the side of the favorite."""
    return replace(
        setup,
        errors=np.array([value]),
        band_start=np.zeros_like(setup.band_start),
        band_count=np.ones_like(setup.band_count),
    )


def finished_games(league, setup, wins_row) -> list[HarbinGame]:
    """Give the counted games of the league with the results of one run filled in."""
    season = [game for game in league.games if game.season == SEASON]
    counted = {
        game.game_key: game
        for game in counted_games(season_games(season), league.teams, last_day=LAST_DAY)
    }
    results = {
        setup.game_keys[game]: "W" if won else "L"
        for game, won in zip(setup.remaining, wins_row, strict=True)
    }
    return [
        replace(game, team_a_result=results.get(key, game.team_a_result))
        for key, game in counted.items()
    ]


class HarbinPointsTest(unittest.TestCase):
    def test_the_runs_follow_the_reference_rules(self) -> None:
        league = make_league()
        setup = league.setup(complete_schedules=frozenset({OTHER}))
        draws = simulate(setup, 40, np.random.default_rng(1))

        for run in range(40):
            lines = standings(
                finished_games(league, setup, draws.team_a_wins[run]),
                league.teams,
                season=SEASON,
                week=10,
                first_day=WEEK_ONE,
            )
            for position, key in enumerate(setup.team_keys[: setup.ohio_count]):
                line = lines[key]
                self.assertAlmostEqual(draws.level_one[run, position], line.level_one)
                self.assertAlmostEqual(draws.level_two[run, position], line.level_two)
                self.assertAlmostEqual(draws.average[run, position], line.average)
            for region in (1, 2):
                members = [
                    lines[key]
                    for key in setup.team_keys[: setup.ohio_count]
                    if league.teams[key].region == region
                ]
                order = seed_region(members)
                places = {key: draws.place[run, setup.team_keys.index(key)] for key in order}
                averages = [round(lines[key].average, 4) for key in order]
                if len(set(averages)) == len(averages):
                    self.assertEqual([places[key] for key in order], list(range(1, len(order) + 1)))

    def test_a_season_without_remaining_games_needs_no_runs(self) -> None:
        league = make_league(played_weeks=10)
        setup = league.setup(complete_schedules=frozenset({OTHER}))
        level_one, _, average, place = harbin_points(
            setup, np.zeros((2, 0), dtype=bool), np.random.default_rng(0)
        )
        lines = standings(
            finished_games(league, setup, []),
            league.teams,
            season=SEASON,
            week=10,
            first_day=WEEK_ONE,
        )

        for position, key in enumerate(setup.team_keys[: setup.ohio_count]):
            self.assertAlmostEqual(level_one[1, position], lines[key].level_one)
            self.assertAlmostEqual(average[0, position], lines[key].average)
        self.assertEqual(sorted(place[0, :4]), [1, 2, 3, 4])


class BracketTest(unittest.TestCase):
    def test_seed_one_meets_the_last_seed_first(self) -> None:
        self.assertEqual(bracket_order(16), [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11])
        self.assertEqual(bracket_order(1), [1])

    def test_the_only_qualifier_wins_the_region(self) -> None:
        setup = replace(
            make_league().setup(), playoff_format=PlayoffFormat(qualifiers=1, byes=0, home_games=1)
        )
        draws = simulate(setup, 20, np.random.default_rng(0))

        champions = np.argwhere(draws.region_champion)
        for run, team in champions:
            self.assertEqual(draws.place[run, team], 1)
        self.assertEqual(len(champions), 20 * 2)

    def test_the_favorite_of_every_game_wins(self) -> None:
        # Every favorite wins by far more than the error, so each region goes to the team with the
        # best rating among its qualifiers, give or take the home edge.
        setup = constant_error(
            replace(
                make_league().setup(),
                playoff_format=PlayoffFormat(qualifiers=4, byes=0, home_games=2),
            ),
            100.0,
        )
        draws = simulate(setup, 5, np.random.default_rng(0))

        for run in range(5):
            for region in (1, 2):
                members = np.flatnonzero(setup.regions == region)
                champion = members[draws.region_champion[run, members]]
                self.assertEqual(len(champion), 1)
                best = draws.ratings[run, members].max()
                self.assertGreaterEqual(
                    draws.ratings[run, champion[0]], best - 2 * setup.home_edge_points
                )


class BracketRoundsTest(unittest.TestCase):
    """Plays one region of twelve qualifiers in which the team with the better rating always wins.

    Seed s has the rating 100 - 10 s, except seed 9, which has 200, so it beats seeds 8 and 1 and
    then meets seed 4 as the worse seed.
    """

    def test_each_round_pairs_and_hosts_as_the_ohsaa_does(self) -> None:
        ratings = np.array([[100.0 - 10 * seed for seed in range(1, 13)]])
        ratings[0, 8] = 200.0
        setup = types.SimpleNamespace(
            regions=np.full(12, 1),
            playoff_format=playoff_format(SEASON),
            home_edge_points=1.5,
            playoff_group=0,
        )
        place = np.arange(1, 13)[None, :]
        rounds: list[list[float]] = []

        def favorite_wins(_setup, expected, _group, _rng):
            rounds.append([float(value) for value in expected[0]])
            return expected

        with patch.object(simulation, "_margins", favorite_wins):
            champion = simulation.region_champions(setup, ratings, place, np.random.default_rng(0))

        def edge(first: int, second: int, host: float = 1.5) -> float:
            return ratings[0, first - 1] - ratings[0, second - 1] + host

        # The games of round one are 1 v 16, 8 v 9, 4 v 13, 5 v 12, 2 v 15, 7 v 10, 3 v 14 and
        # 6 v 11. Seeds 13 to 16 are byes.
        self.assertEqual(
            [rounds[0][index] for index in (1, 3, 5, 7)],
            [edge(8, 9), edge(5, 12), edge(7, 10), edge(6, 11)],
        )
        # Seed 9 beat seed 8 and meets seed 1. The better seed hosts.
        self.assertEqual(rounds[1], [edge(1, 9), edge(4, 5), edge(2, 7), edge(3, 6)])
        # In round three seed 9 meets seed 4 as the worse seed, so seed 4 hosts.
        self.assertEqual(rounds[2], [edge(9, 4, -1.5), edge(2, 3)])
        # The regional final is on a neutral field.
        self.assertEqual(rounds[3], [edge(9, 2, 0.0)])
        self.assertEqual(np.flatnonzero(champion[0]).tolist(), [8])

    def test_an_older_format_hosts_fewer_rounds(self) -> None:
        ratings = np.array([[100.0 - 10 * seed for seed in range(1, 9)]])
        setup = types.SimpleNamespace(
            regions=np.full(8, 1),
            playoff_format=playoff_format(2019),
            home_edge_points=1.5,
            playoff_group=0,
        )
        rounds: list[list[float]] = []

        def favorite_wins(_setup, expected, _group, _rng):
            rounds.append([float(value) for value in expected[0]])
            return expected

        with patch.object(simulation, "_margins", favorite_wins):
            simulation.region_champions(
                setup, ratings, np.arange(1, 9)[None, :], np.random.default_rng(0)
            )

        # Only the first round is hosted. Seed 1 meets seed 4 and then seed 2 on neutral fields.
        self.assertEqual(rounds[0][0], ratings[0, 0] - ratings[0, 7] + 1.5)
        self.assertEqual(rounds[1][0], ratings[0, 0] - ratings[0, 3])
        self.assertEqual(rounds[2], [ratings[0, 0] - ratings[0, 1]])


class DoubleForfeitTest(unittest.TestCase):
    def test_a_double_forfeit_gives_no_team_a_win(self) -> None:
        league = make_league(played_weeks=10)
        season = [game for game in league.games if game.season == SEASON]
        counted = list(counted_games(season_games(season), league.teams, last_day=LAST_DAY))
        counted[0] = replace(counted[0], team_a_result="L", team_b_result="L")
        setup = build_setup(
            season=SEASON,
            teams=league.teams,
            harbin_games=counted,
            games={game.game_key: game for game in season},
            result=league.result,
            playoff_format=playoff_format(SEASON),
            complete_schedules=frozenset({OTHER}),
        )
        level_one, _, average, _ = harbin_points(
            setup, np.zeros((1, 0), dtype=bool), np.random.default_rng(0)
        )
        lines = standings(counted, league.teams, season=SEASON, week=10, first_day=WEEK_ONE)

        for position, key in enumerate(setup.team_keys[: setup.ohio_count]):
            self.assertAlmostEqual(level_one[0, position], lines[key].level_one)
            self.assertAlmostEqual(average[0, position], lines[key].average)


class SetupTest(unittest.TestCase):
    def test_fills_an_unknown_schedule_to_ten_games(self) -> None:
        league = make_league(played_weeks=10)
        known = league.setup(complete_schedules=frozenset({OTHER}))
        filled = league.setup()
        other = filled.team_keys.index(OTHER)

        self.assertEqual(known.final_games[other], 1)
        self.assertEqual(filled.final_games[other], 10)
        self.assertEqual(
            filled.fixed_wins[other], known.fixed_wins[other] + 9 * UNKNOWN_GAME_WIN_SHARE
        )
        # The Ohio opponent of that team now has a larger divisor.
        opponent = filled.team_keys.index("T0")
        self.assertEqual(filled.final_divisor[opponent], known.final_divisor[opponent] + 9)

    def test_groups_the_remaining_games_by_date(self) -> None:
        setup = make_league(played_weeks=5).setup()

        self.assertEqual(len(setup.days), 5)
        self.assertEqual(setup.days[0][0], 0)
        self.assertEqual(setup.days[-1][1], len(setup.remaining))
        self.assertTrue(all(setup.days_without_repeats))

    def test_a_group_without_errors_borrows_the_largest_group(self) -> None:
        league = make_league()
        trimmed = replace(
            league.result,
            predictions=tuple(p for p in league.result.predictions if p.bucket != "games_5"),
        )
        league.result = trimmed
        setup = league.setup()
        sizes = Counter(
            p.bucket
            for p in trimmed.predictions
            if p.is_ohio_game and p.actual_margin is not None and p.season < SEASON
        )

        names = sorted(sizes)
        largest = names.index(max(names, key=sizes.get))

        first_day = setup.error_group[: setup.days[0][1]]
        self.assertNotIn("games_5", sizes)
        self.assertIn(largest, set(first_day.tolist()))


class RatingUpdateTest(unittest.TestCase):
    def test_a_run_moves_the_ratings_by_the_rule_of_the_backtest(self) -> None:
        # Every favorite wins by seven points more than expected.
        setup = constant_error(make_league(played_weeks=9).setup(), 7.0)
        draws = simulate(setup, 3, np.random.default_rng(0))

        for column, game in enumerate(setup.remaining):
            a, b = setup.team_a[game], setup.team_b[game]
            expected = setup.ratings[a] - setup.ratings[b] + setup.home_edge[column]
            margin = expected + (7 if expected >= 0 else -7)
            surprise = np.clip(margin, -56, 56) - np.clip(expected, -56, 56)
            self.assertTrue((draws.team_a_wins[:, column] == (margin > 0)).all())
            self.assertAlmostEqual(
                draws.ratings[0, a], setup.ratings[a] + setup.weight_a[column] * surprise
            )
            self.assertAlmostEqual(
                draws.ratings[0, b], setup.ratings[b] - setup.weight_b[column] * surprise
            )

    def test_a_game_against_another_state_moves_the_ohio_team_by_a_share(self) -> None:
        setup = make_league(played_weeks=9).setup()
        result = make_league(played_weeks=9).result
        column = next(
            column
            for column, game in enumerate(setup.remaining)
            if setup.team_keys[setup.team_b[game]] == OTHER
        )
        ohio = setup.team_keys[setup.team_a[setup.remaining[column]]]
        scored = result.scored_games[(SEASON, ohio)]

        self.assertAlmostEqual(
            setup.weight_a[column], CONFIG.other_state_weight * CONFIG.learning_weight(scored)
        )
        self.assertAlmostEqual(setup.weight_b[column], CONFIG.learning_weight(0))

    def test_a_team_with_two_games_on_a_date_adds_both_changes(self) -> None:
        league = make_league(played_weeks=9)
        last = max(game.game_date for game in league.games)
        league.games.append(
            Game(
                game_key="extra",
                season=SEASON,
                game_date=last,
                team_a_key="T7",
                team_a_name="T7",
                team_b_key="T1",
                team_b_name="T1",
                team_a_result="unknown",
                team_a_division=2,
                team_b_division=2,
            )
        )
        setup = constant_error(league.setup(), 3.0)
        draws = simulate(setup, 2, np.random.default_rng(0))

        self.assertFalse(setup.days_without_repeats[-1])
        team = setup.team_keys.index("T1")
        changes = 0.0
        for column, game in enumerate(setup.remaining):
            a, b = setup.team_a[game], setup.team_b[game]
            expected = setup.ratings[a] - setup.ratings[b] + setup.home_edge[column]
            surprise = 3.0 if expected >= 0 else -3.0
            if a == team:
                changes += setup.weight_a[column] * surprise
            if b == team:
                changes -= setup.weight_b[column] * surprise
        self.assertAlmostEqual(draws.ratings[0, team], setup.ratings[team] + changes)


class ErrorsTest(unittest.TestCase):
    def test_errors_are_seen_from_the_favorite_and_split_by_band(self) -> None:
        result = make_league().result
        sample = next(p for p in result.predictions if p.season == SEASON - 1)
        close = replace(sample, bucket="games_6", predicted_margin=-2.0, actual_margin=-5)
        clear = replace(sample, bucket="games_6", predicted_margin=22.0, actual_margin=30)
        result = replace(result, predictions=(close,) * 200 + (clear,) * 10)

        errors, groups, band_start, band_count = _errors(result, SEASON, CONFIG)

        self.assertEqual(groups, {"games_6": 0})
        # The favorite of the close game won by three more than expected.
        self.assertEqual(errors[0], 3.0)
        self.assertEqual(errors[-1], 8.0)
        self.assertEqual((band_start[0, 0], band_count[0, 0]), (0, 200))
        # The band of the clear favorite has too few errors, so it uses the whole group.
        self.assertEqual((band_start[0, 5], band_count[0, 5]), (0, 210))


class NewProgramTest(unittest.TestCase):
    def test_a_new_program_opens_at_the_rating_of_its_opponent_in_the_run(self) -> None:
        league = make_league(played_weeks=8)
        last = max(game.game_date for game in league.games)
        league.teams["Y"] = HarbinTeam("Y", False, 3, None)
        league.games.append(
            Game(
                game_key="new",
                season=SEASON,
                game_date=last,
                team_a_key="T7",
                team_a_name="T7",
                team_b_key="Y",
                team_b_name="Y",
                team_a_result="unknown",
                team_a_division=2,
                team_b_state="PA",
            )
        )
        setup = constant_error(league.setup(), 5.0)
        column = next(c for c, g in enumerate(setup.remaining) if setup.game_keys[g] == "new")
        new, peer = setup.team_keys.index("Y"), setup.team_keys.index("T7")

        self.assertEqual((setup.opening_team[column], setup.opening_peer[column]), (new, peer))
        self.assertEqual(int((setup.opening_team >= 0).sum()), 1)
        draws = simulate(setup, 1, np.random.default_rng(0))
        # T7 plays week 9 in the run first, so Y opens at its rating after that game. The game is
        # then even, team A counts as the favorite and wins by five.
        before = draws.ratings[0, peer] - setup.weight_a[column] * 5.0
        self.assertAlmostEqual(draws.ratings[0, new], before - setup.weight_b[column] * 5.0)


class SidesTest(unittest.TestCase):
    def test_a_team_from_another_state_as_team_a(self) -> None:
        league = make_league(played_weeks=9)
        last = max(game.game_date for game in league.games)
        league.games.append(
            Game(
                game_key="flipped",
                season=SEASON,
                game_date=last,
                team_a_key=OTHER,
                team_a_name=OTHER,
                team_b_key="T7",
                team_b_name="T7",
                team_a_result="unknown",
                team_b_division=2,
                team_a_state="PA",
            )
        )
        setup = league.setup()
        column = next(
            column
            for column, game in enumerate(setup.remaining)
            if setup.game_keys[game] == "flipped"
        )
        scored = league.result.scored_games[(SEASON, "T7")]

        self.assertAlmostEqual(
            setup.weight_b[column], CONFIG.other_state_weight * CONFIG.learning_weight(scored)
        )

    def test_a_date_without_rated_games(self) -> None:
        league = make_league(played_weeks=9)
        season = [game for game in league.games if game.season == SEASON]
        last = max(game.game_date for game in season)
        records = {game.game_key: game for game in season if game.game_date != last}
        counted = counted_games(season_games(season), league.teams, last_day=LAST_DAY)
        setup = build_setup(
            season=SEASON,
            teams=league.teams,
            harbin_games=counted,
            games=records,
            result=league.result,
            playoff_format=playoff_format(SEASON),
        )
        draws = simulate(setup, 5, np.random.default_rng(0))

        self.assertFalse(setup.rated.any())
        self.assertTrue((draws.ratings == setup.ratings).all())


class UnratedGameTest(unittest.TestCase):
    def test_a_game_without_a_record_follows_the_records_of_its_teams(self) -> None:
        league = make_league(played_weeks=9)
        setup = league.setup()
        unrated = np.zeros_like(setup.rated)
        unrated[0] = True
        setup = replace(setup, rated=setup.rated & ~unrated)
        chance = setup.record_probability[0]
        draws = simulate(setup, 4000, np.random.default_rng(3))

        self.assertAlmostEqual(draws.team_a_wins[:, 0].mean(), chance, delta=0.03)

    def test_the_same_seed_gives_the_same_runs(self) -> None:
        setup = make_league().setup()
        first = simulate(setup, 10, np.random.default_rng(5))
        second = simulate(setup, 10, np.random.default_rng(5))

        self.assertTrue((first.team_a_wins == second.team_a_wins).all())
        self.assertTrue((first.place == second.place).all())


class SeasonGamesTest(unittest.TestCase):
    def test_carries_the_flag_of_a_game_that_does_not_count(self) -> None:
        game = Game("g", SEASON, date(2026, 9, 4), "A", "A", "B", "B", "W", is_playoff_game=True)

        (converted,) = season_games([game], {"g": False})

        self.assertFalse(converted.counts)
        self.assertTrue(converted.is_playoff_game)
        self.assertTrue(season_games([game])[0].counts)


if __name__ == "__main__":
    unittest.main()
