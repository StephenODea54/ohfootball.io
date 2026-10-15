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
surprise     = clip(actual margin, -56, 56) - clip(expected margin, -56, 56)
new rating A = rating A + k(n A) * surprise
new rating B = rating B - k(n B) * surprise
k(n)         = 1.65 / (n + 5)
```

`n` is the number of games with scores that the team played earlier in the season. A rating moves
by a third of the surprise in the first game of a season, and by about an eighth in the tenth game.
Each team uses its own `k`, so the two changes of a game do not always cancel.

Both margins pass through the cap. A team expected to win by 60 that wins by 70 has no surprise.
Without the cap on the expected margin, such a team could only lose rating. The expected margin
that gives the win probability is not clipped.

All games on one date use the ratings of the start of that date, because kickoff times are not
known. A game without both scores gets a prediction but moves no rating. Forfeits, canceled games
and games without a result do not count. A game needs at least one Ohio team. A game against a
team from another state follows the rules under "Games against a team from another state" below.

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

### Games against a team from another state

A team from another state gets a rating of its own, by season, from its games against Ohio teams.
A team is an Ohio team only when its `state_code` is OH. In such a game the Ohio team moves by 0.25
of its normal change, and the other team moves by its full change against the same expected
margin. Both margins pass through the cap, as in a game between two Ohio teams. The game counts as
a game played and a scored game of the Ohio team. A game without both scores is left out.

A program from another state with an earlier season against Ohio teams carries its rating into the
next season by the same rule as an Ohio program, by its own `source_id`, without a division prior.
A program with no earlier season against Ohio teams opens at the pregame rating of the Ohio team
that it first plays. The expected margin of that game is then the home term alone. Teams mostly
schedule teams of their own level, so the rating of the first opponent is a good first estimate.
When two Ohio teams play a new program on the same date, the game with the first game key gives the
opening. A program opens only one time in a season, and after that its rating moves with each
game.

Such a game gets a prediction like every other game, with the rating of each team on its side and
a win probability from the slope of its group. It never shapes a slope, and the `evaluate`
command never scores it. A team from another state is never ranked and is never in
`fct_team_ratings`. Its rating appears only in the predictions of its games.

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
| Slope for 2026 | 0.071 | 0.094 | 0.106 | 0.118 | 0.125 | 0.123 | 0.131 | 0.136 |

### Parameters

| Parameter | Value | What it does |
| --- | ---: | --- |
| Home edge | 1.5 points | Added to the expected margin of the home team |
| Margin cap | 56 points | The largest margin that an update reads, for the actual and for the expected margin |
| Learning rate | 1.65 / (n + 5) | The share of a surprise that moves a rating |
| Division step | 12 points | The gap between the priors of two divisions |
| Last season | 0.8 | The share of the last season in the start of a season |
| Earlier seasons | 0.2 | The share of the mean of up to eight seasons before that one |
| Slope window | 10 seasons | The seasons that each slope is fit on |
| Fallback slope | 0.10 | The slope of a group without games in the window |
| Other-state weight | 0.25 | The share of its normal change that an Ohio team moves by in a game against another state |

The values were chosen by a grid search on the seasons 2000 through 2011, which is not part of this
repository. The same values are the best on 2000 through 2023. About 1.3% of games have a margin
larger than the cap, and about 1.7% have an expected margin larger than the cap. A cap on the
actual margin alone changed the log loss by less than 0.0001. With the cap on the expected margin
as well, the log loss of 2000 through 2023 goes from 0.4041 to 0.4036 and the Brier score from
0.1318 to 0.1317, and the log loss of the 2024-2025 holdout goes from 0.3695 to 0.3692. The update
with both caps is better in 11 of the 12 two-season windows.

The games against teams from other states lower the log loss of 2000 through 2023 from 0.4036 to
0.4031 and the Brier score from 0.1317 to 0.1315. The log loss of the 2024-2025 holdout goes from
0.3692 to 0.3687. They help most in the games of a team that already played another state that
season: from 2004 through 2023 the log loss of those games goes from 0.3724 to 0.3686, and in the
holdout from 0.3264 to 0.3236. The rating with these games is better in each of the 12 two-season
windows.

A weight of 0.5 for the Ohio team gives a log loss of 2000 through 2023 that is 0.0003 lower, and
the holdout log loss changes by less than 0.0001. But with 0.5, four teams of the 2026 top 50 move
by five to eight places when these games are added, and the order agrees less with an independent
ranking of Ohio teams. With 0.25, no team of the 2026 top 50 moves by more than four places.

## Evidence

The `evaluate` command gives every number below. It replays the record from 1972, scores each
two-season window from 2000 through 2023, and scores 2024 and 2025 as a holdout. No choice of a
value saw the holdout. The numbers come from the public dataset export of 2026-09-29.

| Seasons | Games | Log loss | Brier score | Winner picked |
| --- | ---: | ---: | ---: | ---: |
| 2000-2001 | 7,270 | 0.4218 | 0.1381 | 79.5% |
| 2002-2003 | 7,297 | 0.4272 | 0.1407 | 78.8% |
| 2004-2005 | 7,299 | 0.4312 | 0.1417 | 79.0% |
| 2006-2007 | 7,352 | 0.4085 | 0.1332 | 80.3% |
| 2008-2009 | 7,380 | 0.4025 | 0.1311 | 80.7% |
| 2010-2011 | 7,366 | 0.3951 | 0.1285 | 81.1% |
| 2012-2013 | 7,415 | 0.3982 | 0.1301 | 80.9% |
| 2014-2015 | 7,448 | 0.4049 | 0.1332 | 79.9% |
| 2016-2017 | 7,433 | 0.3860 | 0.1254 | 81.8% |
| 2018-2019 | 7,389 | 0.3978 | 0.1291 | 81.2% |
| 2020-2021 | 6,680 | 0.3967 | 0.1277 | 81.9% |
| 2022-2023 | 7,726 | 0.3687 | 0.1193 | 82.8% |
| **2000-2023** | **88,055** | **0.4031** | **0.1315** | **80.7%** |
| **2024-2025 holdout** | **7,608** | **0.3687** | **0.1193** | **82.3%** |

The Elo rating that this model replaced scored a log loss of 0.4248 and picked 79.5% of winners
on the same 2024-2025 holdout, as recorded on 2026-08-09.

**Log loss** is the primary metric. It punishes a confident forecast that was wrong, so it shows
an overconfident model. **Brier score** is the mean squared error of the probabilities. A constant
50% forecast scores 0.6931 in log loss and 0.25 in Brier score. **Winner picked** is the share of
games in which the favorite won. It leaves out ties and exact 50% forecasts, and it cannot tell a
51% forecast from a 90% forecast.

## Playoff projections

### The computer points

`harbin.py` holds the rules of the OHSAA computer points. A win gives Level 1 points by the
division of the opponent, from 6.5 for division I down to 3.5 for division VII. A tie gives half.
A win also gives Level 2 points: the Level 1 points of the defeated opponent. A team from another
state gives the points of its assigned division for each of its wins instead. The average is:

```text
average = Level 1 / games played + 10 * Level 2 / divisor
divisor = 100 - 10 * (own open dates) - (open dates of each opponent played)
```

At the end of the season, the divisor of a team with ten games is the sum of the counted games of
its opponents. Two averages that agree to four decimals are a tie. The third level of points breaks
it: the Level 2 points of the defeated opponents. A draw breaks a tie that remains.

From 2025, twelve teams of each region qualify. Seeds one to four get a bye and host the second
round. Seeds five to eight host the first round. Sixteen teams qualified from 2021 to 2024, and
eight before 2020.

The rules follow the OHSAA Football Tournament Regulations, sections 5 and 7. The section on the
`project` command below compares the points with the OHSAA ratings.

### The simulation

`simulation.py` plays the rest of a regular season many times. Each run starts from the ratings of
the day of the run and plays the remaining games date by date. The margin of a game is the expected
margin plus an error drawn from the errors that the model made in the ten earlier seasons, in games
of the same slope group. The ratings then move by the rule of the backtest, so a team that wins in
a run is stronger in its later games of that run. After the last date, each run computes the
points and seeds each region.

The errors come from the record and not from a normal curve, because the errors of the model have
heavier tails than a normal curve. The errors are also wider in a close game than in a game with a
clear favorite. So a game draws its error from the earlier games whose expected margin was within
the same band of four points, and the error is measured from the side of the favorite. With one
pool for each slope group, a favorite won two to four points less often in the runs than its
published win probability says, and the record agrees with the published probability. With the
bands, the runs give the published probability of a game within 0.008 on average.

A new program from another state opens at the rating that its Ohio opponent has in the run on the
date of the game, as in the backtest. A game without a rating, such as a game between two teams
from other states, has no expected margin, so the records of the two teams decide it.

All runs of a chunk move together in numpy arrays, and the loop goes over the dates only. The
played games give the same points in every run, so the setup adds them up one time.

After the regular season of a run, the qualifiers of each region fill a bracket. The better seed
hosts each game but the regional final, which is on a neutral field. A playoff game draws its error
from the errors of earlier playoff games, and the ratings stay as they were at the end of the
regular season.

`projection.py` counts the runs. For each team and each number of its remaining games that it
wins, it counts the place in the region and the final average. For each of its remaining games, it
counts the runs in which the team won that game and the runs in which it lost it. It also counts
the runs in which the team won its region. From the counts it gives the chance to qualify, to play
at home, to get a bye and to win the region, the mean seed, the odds of each final record, and the
odds if the team wins and if it loses each of its games. A percentile of an average is read from a
histogram with bins of 0.1, and the runs of a bin are taken to spread evenly across it.

The runs of a projection split into chunks, and each chunk gets a seed of its own, so the result
does not depend on the number of processes. On a laptop, 100,000 runs of the 2026 season after week
six take about four seconds with eight processes and about fourteen seconds with one.

### What the projection does not know

- A team from another state whose page the scrape could not read is taken to play ten games, and
  it wins half of the games that are not known.
- The record of a team from another state comes from its own page, so a game against a team that
  the site does not link is not in it.
- The OHSAA breaks a tie that involves a team from another state with other steps. The projection
  uses the third level for every tie.
- A team that opts out of the playoffs, or that the OHSAA rules out, still gets a seed.
- When a team from another state plays more than ten games, only its first ten count. The OHSAA
  has an exception when the game against the Ohio team is the eleventh. The projection does not
  apply it.
- A game that does not count, such as the eleventh game of a team from another state, does not
  move a rating in a run. The backtest would replay it.

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
December snapshot of each past season. The weekly snapshots of earlier dates stay. To replace a
snapshot instead, run again with the `--as-of-date` of that snapshot.

The API gives the rank of each team one week before a snapshot. It reads that rank from the
ratings that the predictions of the games of the week hold, so it needs no earlier snapshot, and a
second run in the same week does not change it. Every game that moves a rating must therefore get a
prediction dated the day of the game. A run with an older `--as-of-date` dates the predictions of
the later games that day, so until the next run with the current date, the newer snapshots of the
season show no movement.

The command also replaces every row of `ohfootball_marts.fct_game_predictions`. It holds every
game of an Ohio team, and so also every game against a team from another state. A game played
before `--as-of-date` gets the prediction that the backtest made before its result was known,
dated the day of the game. A game of the season in progress that was not played before that day
gets a prediction from the current ratings, dated the day of the run. A game of a past season
that never got a result gets no prediction. Each row holds both pregame ratings, the expected
margin and the win probability of team A. A run with an older `--as-of-date` therefore also
rewrites the predictions as they were on that day, until the next run with the current date.

### Project the playoffs

```bash
ohfootball-rating project --season 2026 --runs 100000 --workers 8
```

The command reads the games of the season from `ohfootball_marts.fct_harbin_games`: the current
games of the Ohio teams, the mark of each game that the OHSAA does not rate, and the games between
the opponents from other states. It starts from the last week that is over at `--as-of-date`. A
week runs from Wednesday to Tuesday, and it is over from the Sunday after its games. A game after
that week is played in the runs, even when its result is known already, and the replay of the
rating stops before it. So the record, the remaining games and the ratings always meet at the same
point. The command plays the rest of the regular season `--runs` times and replaces the projection
of the season at `--as-of-date` in three tables:

- `dim_playoff_projections`: the number of runs, the seed and the playoff format.
- `fct_playoff_outlooks`: the computer points of each Ohio team after the finished weeks, its odds
  to qualify, to play at home, to get a bye and to win its region, its mean seed, its remaining
  games in the order of their dates, and its odds if it wins and if it loses each of them.
- `fct_playoff_record_odds`: the odds of each final record of each team, with the range of its
  final average. A row holds wins and losses only. The runs play no ties, so the ties of a team
  are the ties of its record.

The seed defaults to the as-of date, so a second run on the same day gives the same numbers. The
command stores nothing and succeeds before week one is over, when no Ohio team has a region yet,
and when no earlier season gives the errors of the model.

The regular season ends on the Saturday of week ten, because the OHSAA counts only the games played
by then. A makeup game on the Monday or the Tuesday after does not count. A double forfeit is a
loss for both teams.

With the scrape of 2026-10-01, the computer points after week six agree with the OHSAA ratings of
2026-09-29 for each of the 700 Ohio teams with a region, in the record, both levels, the divisor
and the average. With the scrape of 2026-10-14, the points after week eight agree with the OHSAA
ratings of 2026-10-13 for each of the 700 teams in the same way. A team without a region, such as
a school whose games were all canceled, gets no projection. A projection of 100,000 runs, with the
replay and the reads, takes about fifteen seconds on a laptop.

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
`--as-of-date` to leave out games on or after a date. The report scores games between two Ohio
teams only. `games` counts them, and `other_state_games` counts the predictions of games against
another state.

The `/accuracy` page of the site and the `modelAccuracy` query of the API score the stored
predictions with the same rules as this command. They score the rows of the last run, so they
match this command only when the stored rows and this command come from the same code.

Run `make coverage` in `services/rating` to see the line and branch coverage of the unit tests.

## What the rating does not know

- It reads only scores, dates, home teams, divisions and the playoff flag. It knows nothing of
  rosters, injuries, coaching changes or weather.
- It knows a team from another state only from that team's games against Ohio teams, so the
  rating of such a team is rough, and a game against it moves the Ohio team by a quarter of a
  normal change.
- A new program from another state opens at the rating of the first Ohio team that it plays. If
  it first plays a team far above or below its own level, it opens far from that level.
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

The first margin rating capped only the actual margin in the update. With the cap on the expected
margin too, the holdout log loss went from 0.3695 to 0.3692. The first margin rating also left out
every game against a team from another state. With those games, it went to 0.3687. A first
version of that rule opened a new program from another state at the mean rating that such games
implied for the opponents of Ohio teams of the same division, so it counted national programs as
average teams. A new program now opens at the rating of its first Ohio opponent.
