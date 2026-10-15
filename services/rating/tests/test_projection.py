import unittest
from dataclasses import replace

import numpy as np
from season_fixture import make_league

from ohfootball_rating.harbin import PlayoffFormat
from ohfootball_rating.projection import (
    BINS,
    _quantiles,
    outlooks,
    own_games,
    own_results,
    run_projection,
)

# Two teams of each region of four qualify, the first gets a bye and the first two play at home.
SMALL = PlayoffFormat(qualifiers=2, byes=1, home_games=2)


def small_setup(played_weeks: int = 7):
    return replace(make_league(played_weeks=played_weeks).setup(), playoff_format=SMALL)


class OwnGamesTest(unittest.TestCase):
    def test_lists_the_remaining_games_of_each_team_in_order(self) -> None:
        setup = small_setup()
        own = own_games(setup)

        for team in range(setup.ohio_count):
            columns = own.columns[team][own.columns[team] >= 0]
            self.assertEqual(len(columns), own.counts[team])
            self.assertEqual(list(columns), sorted(columns))
            for column, is_a in zip(columns, own.is_team_a[team], strict=False):
                game = setup.remaining[column]
                side = setup.team_a[game] if is_a else setup.team_b[game]
                self.assertEqual(side, team)

    def test_reads_each_result_from_the_side_of_the_team(self) -> None:
        setup = small_setup()
        own = own_games(setup)
        wins = np.zeros((1, len(setup.remaining)), dtype=bool)

        won, present = own_results(own, wins)

        # Team A loses every game, so a team wins exactly the games in which it is team B.
        self.assertTrue((won[0] == (~own.is_team_a & present)).all())

    def test_a_season_without_remaining_games_has_no_results(self) -> None:
        setup = small_setup(played_weeks=10)
        won, _ = own_results(own_games(setup), np.zeros((3, 0), dtype=bool))

        self.assertFalse(won.any())
        self.assertEqual(won.shape[0], 3)


class ProjectionTest(unittest.TestCase):
    def test_the_odds_add_up(self) -> None:
        setup = small_setup()
        tally = run_projection(setup, runs=600, seed=11, chunk=250)
        current = [0] * setup.ohio_count
        teams = outlooks(setup, tally, current, current)

        self.assertEqual(tally.runs, 600)
        self.assertEqual(len(teams), setup.ohio_count)
        for team in teams:
            self.assertAlmostEqual(sum(row.probability for row in team.records), 1.0)
            self.assertAlmostEqual(
                team.qualify, sum(row.probability * row.qualify for row in team.records)
            )
            self.assertLessEqual(team.bye, team.home)
            self.assertLessEqual(team.home, team.qualify)
            self.assertGreaterEqual(team.expected_seed, 1.0)
            self.assertEqual(
                [row.wins for row in team.records],
                sorted((row.wins for row in team.records), reverse=True),
            )
            for row in team.records:
                self.assertLessEqual(row.low_average, row.median_average)
                self.assertLessEqual(row.median_average, row.high_average)
        self.assertAlmostEqual(sum(team.qualify for team in teams), 4.0)
        # One team wins each of the two regions in each run.
        self.assertAlmostEqual(sum(team.region_win for team in teams), 2.0)

    def test_the_odds_of_a_game_add_up_to_the_odds_of_the_team(self) -> None:
        setup = small_setup()
        tally = run_projection(setup, runs=600, seed=12, chunk=300)
        current = [0] * setup.ohio_count
        teams = outlooks(setup, tally, current, current)
        own = own_games(setup)

        for team in teams:
            position = setup.team_keys.index(team.team_key)
            self.assertEqual(len(team.games), own.counts[position])
            for index, game in enumerate(team.games):
                win_runs = tally.game_odds[position, index, 1, 0]
                loss_runs = tally.game_odds[position, index, 0, 0]
                self.assertEqual(win_runs + loss_runs, tally.runs)
                total = sum(
                    runs * share
                    for runs, share in (
                        (win_runs, game.qualify_if_win),
                        (loss_runs, game.qualify_if_loss),
                    )
                    if share is not None
                )
                self.assertAlmostEqual(total / tally.runs, team.qualify)

    def test_records_add_the_games_already_played(self) -> None:
        setup = small_setup()
        tally = run_projection(setup, runs=100, seed=5, chunk=100)
        own = own_games(setup)
        wins = [3] * setup.ohio_count
        losses = [2] * setup.ohio_count

        for team in outlooks(setup, tally, wins, losses):
            games = own.counts[setup.team_keys.index(team.team_key)]
            for row in team.records:
                self.assertEqual(row.wins + row.losses, 5 + games)

    def test_the_result_does_not_depend_on_the_workers(self) -> None:
        setup = small_setup()
        one = run_projection(setup, runs=300, seed=4, chunk=100, workers=1)
        two = run_projection(setup, runs=300, seed=4, chunk=100, workers=2)

        for name in ("record_place", "record_average", "game_odds", "region_wins"):
            self.assertTrue((getattr(one, name) == getattr(two, name)).all(), name)

    def test_a_season_without_remaining_games(self) -> None:
        setup = small_setup(played_weeks=10)
        tally = run_projection(setup, runs=20, seed=1, chunk=10)
        current = [0] * setup.ohio_count

        for team in outlooks(setup, tally, current, current):
            self.assertEqual(len(team.records), 1)
            self.assertEqual(team.games, ())

    def test_a_team_without_a_region_has_no_outlook(self) -> None:
        setup = small_setup()
        regions = setup.regions.copy()
        regions[0] = -1
        setup = replace(setup, regions=regions)
        tally = run_projection(setup, runs=50, seed=1, chunk=50)
        current = [0] * setup.ohio_count

        keys = {team.team_key for team in outlooks(setup, tally, current, current)}

        self.assertNotIn(setup.team_keys[0], keys)

    def test_a_format_without_byes_gives_no_bye(self) -> None:
        setup = replace(small_setup(), playoff_format=PlayoffFormat(2, 0, 2))
        tally = run_projection(setup, runs=50, seed=8, chunk=50)
        current = [0] * setup.ohio_count

        self.assertTrue(all(team.bye == 0.0 for team in outlooks(setup, tally, current, current)))


class QuantileTest(unittest.TestCase):
    def test_spreads_the_runs_of_a_bin_across_it(self) -> None:
        histogram = np.zeros(BINS, dtype=np.int64)
        histogram[10] = 1
        histogram[20] = 3

        # The 10th percentile is 0.4 of the way into bin 10. The median is one third of the way
        # into bin 20, because one of the four runs is below it.
        self.assertEqual(_quantiles(histogram, (0.1, 0.5)), (1.04, 2.03))
        self.assertEqual(_quantiles(np.zeros(BINS), (0.5,)), (0.0,))


if __name__ == "__main__":
    unittest.main()
