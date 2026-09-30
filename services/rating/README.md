# Rating

This service turns the canonical game history in `ohfootball_marts.fct_games` into a rating for
each team and a prediction for each game. The model is a margin rating: each team has a rating in
points, and the gap between two ratings is the score margin that the model expects.

## The model

### The prediction

For a game between team A and team B, the expected margin is:

```text
margin = rating A - rating B + 1.5 * (A is home - B is home)
```

A positive margin means team A is expected to win by that many points. A neutral game has no home
edge.

### The update

After a game with both scores, each rating moves toward the margin that the game had:

```text
surprise     = clip(actual margin, -56, 56) - expected margin
new rating A = rating A + k(n A) * surprise
new rating B = rating B - k(n B) * surprise
k(n)         = 1.65 / (n + 5)
```

`n` is the number of games with scores that the team played earlier in the season. A rating moves
by a third of the surprise in the first game of a season, and by about an eighth in the tenth game.
Each team uses its own `k`, so the two changes of a game do not always cancel.

All games on one date use the ratings of the start of that date, because kickoff times are not
known. A game without both scores gets a prediction but moves no rating. Forfeits, canceled games
and games without a result do not count. Both teams must have `state_code = 'OH'`, so a game
against a team from another state is left out.

### Where a season starts

A program with no earlier season starts at a prior set by its division:

```text
prior = 12 * (4 - division)
```

A division 1 team starts at 36 and a division 7 team starts at -36. A team without a division
starts at 0. A returning program starts from its own history:

```text
start = prior + 0.8 * (last - prior) + 0.2 * (older - prior)
```

`last` is the final rating of the most recent season that the program played, which is not always
the season before. `older` is the mean final rating of the seasons in the eight years before that
season. With these values the prior has no effect on a returning program. Most returning programs
have ratings above the priors, so a new division 4 program starts about 25 points below the median
team, and each division moves that start by 12 points. The size of that gap depends on a replay
of the whole record from 1972, so the rating must always be calculated from the first season.

### From margin to probability

A logistic curve turns the expected margin into a win probability:

```text
P(A wins) = 1 / (1 + e^(-slope * margin))
```

The slope depends on the group of the game. A playoff game is in its own group. A regular season
game is in the group of the smaller number of games that the two teams have played this season,
from 0 to 6 or more. Each slope is fit by logistic regression on the games of the ten seasons
before the season, so a season never uses its own games and the slopes do not change during a
season. A group without games in those seasons uses a slope of 0.10. The slopes rise through a
season, so the model is less sure of a margin in the first weeks:

| Group | 0 | 1 | 2 | 3 | 4 | 5 | 6+ | Playoff |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Slope for 2026 | 0.073 | 0.095 | 0.105 | 0.122 | 0.126 | 0.127 | 0.132 | 0.139 |

### Parameters

| Parameter | Value | What it does |
| --- | ---: | --- |
| Home edge | 1.5 points | Added to the expected margin of the home team |
| Margin cap | 56 points | The largest margin that an update reads |
| Learning rate | 1.65 / (n + 5) | The share of a surprise that moves a rating |
| Division step | 12 points | The gap between the priors of two divisions |
| Last season | 0.8 | The share of the last season in the start of a season |
| Earlier seasons | 0.2 | The share of the mean of up to eight seasons before that one |
| Slope window | 10 seasons | The seasons that each slope is fit on |
| Fallback slope | 0.10 | The slope of a group without games in the window |

The values were chosen by a grid search on the seasons 2000 through 2011, which is not part of this
repository. The same values are the best on 2000 through 2023. The margin cap clips about 1.3% of
games and changes the log loss by less than 0.0001, so it stays only as a guard against a wrong
score.

## Evidence

The `evaluate` command gives every number below. It replays the record from 1972, scores each
two-season window from 2000 through 2023, and scores 2024 and 2025 as a holdout. No choice of a
value saw the holdout. The numbers come from the public dataset export of 2026-09-28.

| Seasons | Games | Log loss | Brier score | Winner picked |
| --- | ---: | ---: | ---: | ---: |
| 2000-2001 | 7,270 | 0.4225 | 0.1384 | 79.4% |
| 2002-2003 | 7,297 | 0.4280 | 0.1410 | 79.1% |
| 2004-2005 | 7,299 | 0.4314 | 0.1417 | 79.1% |
| 2006-2007 | 7,352 | 0.4092 | 0.1334 | 80.4% |
| 2008-2009 | 7,380 | 0.4036 | 0.1315 | 80.5% |
| 2010-2011 | 7,366 | 0.3968 | 0.1291 | 81.0% |
| 2012-2013 | 7,415 | 0.3990 | 0.1305 | 81.0% |
| 2014-2015 | 7,448 | 0.4067 | 0.1338 | 79.8% |
| 2016-2017 | 7,433 | 0.3877 | 0.1259 | 81.7% |
| 2018-2019 | 7,389 | 0.3988 | 0.1294 | 81.4% |
| 2020-2021 | 6,680 | 0.3977 | 0.1280 | 81.9% |
| 2022-2023 | 7,726 | 0.3701 | 0.1198 | 82.7% |
| **2000-2023** | **88,055** | **0.4041** | **0.1318** | **80.7%** |
| **2024-2025 holdout** | **7,608** | **0.3695** | **0.1195** | **82.2%** |

The Elo rating that this model replaced scored a log loss of 0.4248 and picked 79.5% of winners
on the same 2024-2025 holdout, as recorded on 2026-08-09.

**Log loss** is the primary metric. It punishes a confident forecast that was wrong, so it shows
an overconfident model. **Brier score** is the mean squared error of the probabilities. A constant
50% forecast scores 0.6931 in log loss and 0.25 in Brier score. **Winner picked** is the share of
games in which the favorite won. It leaves out ties and exact 50% forecasts, and it cannot tell a
51% forecast from a 90% forecast.

## Running it

Build the dbt marts, then publish the ratings and the predictions:

```bash
make dbt-build
make pipeline ARGS=rate
```

Inside an image that holds the package, the same step is:

```bash
ohfootball-rating publish --season 2026
```

The command writes one rating per current Ohio team and season to
`ohfootball_marts.fct_team_ratings`, with the rating in points and the relative rating. The
relative rating is the rating minus the median rating of the Ohio teams in the same snapshot, so
0 is the median team. Ratings are the values at the start of `--as-of-date`; games on that date
are not in them yet. A team without a game yet gets the rating it opens the season with.

Each run replaces the snapshot of the season in progress at its own `--as-of-date`, and the 31
December snapshot of each past season. The weekly snapshots of earlier dates stay. The API
compares the two newest snapshots of a season to give the previous rank of each team. A second
run on a later day of the same week therefore compares ranks one day apart. To replace a snapshot
instead, run again with the `--as-of-date` of that snapshot.

The command also replaces every row of `ohfootball_marts.fct_game_predictions`. A game played
before `--as-of-date` gets the prediction that the backtest made before its result was known,
dated the day of the game. A game of the season in progress that was not played before that day
gets a prediction from the current ratings, dated the day of the run. A game of a past season
that never got a result gets no prediction. Each row holds both pregame ratings, the expected
margin and the win probability of team A. A run with an older `--as-of-date` therefore also
rewrites the predictions as they were on that day, until the next run with the current date.

### Evaluate the margin rating

The `evaluate` command replays the record and prints its scores as JSON. It reads the local
warehouse, or the files of a dataset export:

```bash
make rating-evaluate
make dataset-export
PYTHONPATH=services/rating/src python3 -m ohfootball_rating.cli evaluate --export-dir services/dataset/export
```

The dataset export writes `dim_teams.csv` and `fct_games.csv`, and the public dataset holds the
same files. Use `--windows`, `--window-size` and `--holdout` to score other seasons, and
`--as-of-date` to leave out games on or after a date.

Run `make coverage` in `services/rating` to see the line and branch coverage of the unit tests.

## What the rating does not know

- It reads only scores, dates, home teams, divisions and the playoff flag. It knows nothing of
  rosters, injuries, coaching changes or weather.
- A game against a team from another state is left out, so a team that plays several of them has
  fewer games behind its rating.
- A new program starts below most teams, and it takes a few games to find its level.
- An upcoming game uses the games played at the day of the run to choose its slope group. A game
  two or more weeks away therefore gets a slope that is a little too low.

## History

The service first used an Elo rating that read only wins and losses. Its best version used a
K-factor of 148, 30 points of home advantage, 85% season carryover, a 140-point division step and
a larger K over each team's first three games. On 2024-2025 it scored a log loss of 0.4248.

The margin of victory as a multiplier on the Elo update did not help: a weight of 0.05 improved
the log loss by only 0.00029. A model that predicts the margin itself did help, because every
game then says how much better one team is, not only which team won. On the same holdout the
margin rating scores 0.3695.
