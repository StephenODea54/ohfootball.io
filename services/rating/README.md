# Elo

This service turns the canonical game history in `ohfootball_marts.fct_games`
into pregame win probabilities. The first version intentionally implements a
plain, inspectable Elo baseline before adding football-specific assumptions.

## Permanent baseline behavior

- Every team begins each season at 1500.
- Only final wins and losses update ratings.
- The default K-factor is 32 and rating scale is 400.
- Scores, margin of victory, home field, divisions, playoffs, and prior seasons
  do not affect a rating.
- Canceled, tied, and unknown results do not update ratings.
- Both participants must have `state_code = 'OH'`; games involving an
  out-of-state, non-OHSAA team are excluded from ratings, predictions, and
  evaluation.
- Ratings reset completely between seasons.
- Games on the same date use start-of-day ratings because kickoff times are not
  available.
- The default cutoff date is calculated in `America/New_York`; set
  `OHFOOTBALL_TIME_ZONE` to override the project timezone.

For team A and team B, the predicted probability is:

```text
P(A wins) = 1 / (1 + 10 ^ ((rating B - rating A) / rating scale))
```

After a completed game, the update is:

```text
new rating A = old rating A + K * (actual result - predicted probability)
```

Team B receives the opposite change, so total rating points are conserved.

The baseline defaults remain deliberately unchanged. That gives every future
strategy a stable control instead of silently moving the goalposts.

## Configurable strategy

The engine also supports a small set of optional, inspectable football
assumptions:

- `--k-factor` controls how quickly a result changes a rating.
- `--home-advantage` adds rating points to the home team for the pregame
  probability. It does not become part of the team's stored strength.
- `--season-carryover` carries a fraction of the prior season's final program
  rating into the next season. Program identity uses the stable source team ID.
- `--division-rating-step` sets a season-opening prior of
  `1500 + (4 - division) * step`. When carryover exists, the prior season's
  rating is regressed toward that current-season prior; division effects do not
  compound across years.
- `--margin-weight` applies a capped logarithmic margin-of-victory multiplier
  to rating updates. Missing scores, including ordinary forfeits, use the
  standard update.
- `--provisional-games` and `--provisional-k-multiplier` apply a shared,
  linearly decaying K-factor boost while either team is early in its season.
  The same boost applies to both rating changes, preserving the zero-sum rating
  pool.

Games marked as double forfeits are excluded because their two losses cannot be
represented by Elo's complementary, zero-sum result update.

## Running it

Build the dbt marts, start MLflow, and run the model:

```bash
make dbt-build
make mlflow-up
make rating-run
```

Publish the production rating snapshot after the marts are refreshed:

```bash
ohfootball-rating publish --season 2026
```

The production command writes one rating per current Ohio team to
`ohfootball_marts.fct_team_elo_ratings`. Ratings are the values available at
the start of `--as-of-date`; games on that date are not incorporated yet.

Each run replaces the snapshot of the season in progress at its own
`--as-of-date`, and the 31 December snapshot of each past season. The weekly
snapshots of earlier dates stay. The API compares the two newest snapshots of a season to
give the previous rank of each team. A second run on a later day of the same
week therefore compares ranks one day apart. To replace a snapshot instead,
run again with the `--as-of-date` of that snapshot.

MLflow is available at <http://localhost:5000>. Each run records the Elo
parameters, data fingerprint, cutoff date, overall and per-season metrics, and
these CSV artifacts:

- `historical_predictions.csv`: each probability captured before its result
  updates the ratings.
- `current_ratings.csv`: final rating for every team-season in the run.
- `upcoming_predictions.csv`: probabilities for unknown games on or after the
  cutoff date.
- `run_summary.json`: compact configuration and evaluation summary.

Run `make coverage` in `services/rating` to see the line and branch coverage of the unit tests.

Use `ARGS` to change the cutoff or deliberately run a parameter experiment:

```bash
make rating-run ARGS="--as-of-date 2026-08-20 --k-factor 24 --run-name k-24"
```

Run a chronological parameter sweep with comma-separated candidate values:

```bash
make rating-sweep ARGS="--parameter k_factor --values 96,128,160,192,224 --run-prefix k"
```

By default, sweeps tune on 2000–2021 and validate on 2022–2023. Games after
2023 are not processed by a sweep, which protects the 2024–2025 final holdout.
Override the windows with `--tuning-seasons 2000:2020` and
`--validation-seasons 2021:2023`. Sweep runs log parameters and window metrics
to MLflow without duplicating large CSV artifacts; a final `run` logs the full
artifacts and per-season metrics.

MLflow is only an experiment tracker here. This project does not use its model
registry or deployment features, and Elo does not need a serialized estimator.

MLflow is an extra of this package and is not installed by default. `run` and
`sweep` need it, so install the package with `pip install '.[tracking]'` to use
them. `publish` writes ratings and predictions to the warehouse and logs
nothing, so it runs without the extra. The weekly run calls `publish` only.

## Metrics worth caring about

**Brier score** is the most approachable primary metric. It is the mean squared
error of the predicted probabilities, so lower is better and a constant 50%
forecast scores 0.25.

**Log loss** is the stricter primary metric. It heavily penalizes confident,
incorrect predictions and helps expose an overconfident model.

**Favorite accuracy** is an intuitive supporting metric, but it discards the
difference between a 51% and a 90% prediction. Exact 50% forecasts are excluded
from accuracy, and `accuracy_coverage` reports what share of games produced a
favorite.

Before treating the probabilities as trustworthy, add a calibration report:
teams predicted near 70% should win about 70% of those games. Metrics should
also be segmented by season and week so degradation is visible rather than
hidden in a lifetime average.

## 2026-08-05 experiment result

The current candidate strategy was selected by log loss on 2022–2023, with
Brier score as confirmation and favorite accuracy as a guardrail. Parameters
were tuned on 2000–2021. The untouched 2024–2025 seasons were evaluated only
after the choices were fixed.

Recommended candidate:

```bash
make rating-run ARGS="--k-factor 148 --home-advantage 30 --season-carryover 0.85 --division-rating-step 140 --provisional-games 3 --provisional-k-multiplier 1.6 --run-name champion-v3-provisional"
```

| 2024–2025 holdout | Plain baseline | Candidate |
| --- | ---: | ---: |
| Games | 7,626 | 7,626 |
| Favorite coverage | 85.12% | 100.00% |
| Favorite accuracy | 74.07% | 79.43% |
| Brier score | 0.2156 | 0.1398 |
| Log loss | 0.6225 | 0.4276 |

Keep K=148, 30 points of home advantage, 85% season carryover, a 140-point
division step, and a 1.6x K boost that decays over each team's first three games
as the candidate. The provisional strategy improved the 2024–2025 holdout over
v2 on accuracy (78.98% to 79.43%), Brier score (0.1416 to 0.1398), and log loss
(0.4323 to 0.4276). Across all 95,818 historical games, it scores 77.70%
accuracy, 0.1512 Brier, and 0.4598 log loss.

Keep the plain defaults as the permanent control. Do not keep margin of victory
yet: a weight of 0.05 improved validation log loss by only 0.00029 while
worsening it across the longer tuning window, so the gain was not stable enough
to justify using scores.

The tracked candidate is MLflow run `1054e7e69a9d49c89bdf3bb6e86d6b31`.
Earlier division experiments whose prior accidentally compounded across years
are tagged `validation_status=invalid` in MLflow.

## 2026-08-09 experiment result

Every result below uses the same method as the 2026-08-05 result. Parameters
were tuned on 2000 through 2023 and scored on the untouched 2024 and 2025
seasons. The candidate strategy is unchanged: K=148, 30 points of home
advantage, 85% season carryover, a 140 point division step, and a 1.6x K boost
across the first three games. Every parameter test below is measured against
0.42762 log loss, 0.13983 Brier score, and 79.50% favorite accuracy, which is
what the candidate scored before the carryover fix at the end of this section.

Ties now count as half a point and forfeits no longer change a rating. The
holdout lost 18 games, which are the forfeits. Log loss and Brier score did not
move at four decimal places, and accuracy rose from 79.43% to 79.50%. Ohio
plays overtime, so ties are almost absent from data after 2000: only 5 games in
88,055 produced no decision. The change is correct, but it does not improve the
model. MLflow run `6f3e2735a4924d1ba249bc6a61344801`.

Four parameters were tested and all four keep their current value.

| Parameter | Range tested | Best value | Log loss against the candidate |
| --- | --- | ---: | ---: |
| Rating scale | 350 to 600 | 425 | -0.00021 |
| Playoff K multiplier | 1.0 to 2.0 | 1.0 | 0.00000 |
| Division K slope | -0.06 to 0.10 | 0.03 | -0.00015 |
| Early season K boost | 0.0 to 0.75 | 0.0 | 0.00000 |

The rating scale is flat between 375 and 500. The best value on the holdout is
425, but the best value on the tuning window is 450, and accuracy peaks at 375.
A real effect would put all three in one place. The gain is also smaller than
the margin of victory gain that was rejected on 2026-08-05, so the same
standard rejects it. Keep 400.

A playoff K multiplier makes the model worse at every value, on both windows,
and the loss grows with the multiplier. By the playoffs both teams carry ten
games of evidence, so a surprise result is more often variance than
information. Raising its weight raises the noise. Keep 1.0.

The division K slope changes the update by school size, where a positive slope
moves the small schools faster. Negative slopes are clearly worse, so the
direction has weak support, but the best gain is smaller than the rating scale
gain and the two windows choose different values. Keep 0.0.

An early season K boost raises the update in week one and falls to no change at
the end of the regular season. It makes log loss worse at every value, but it
raises accuracy to 79.68% at a boost of 0.30. This is the clearest reason to
choose log loss as the primary metric. A model tuned for accuracy would take
this value and would sell worse probabilities under a better headline number.
The boost also overlaps the provisional boost, which already raises the update
across a team's first games. Keep 0.0.

Nine parameters have now been tested. All nine sit at their default or at the
value already chosen. The next gain will not come from another parameter. It
needs either information the model does not have, or a model that predicts the
score rather than the winner.

After those tests, the carryover changed to read the most recent season a
program played rather than the season before. A program that stopped for a
season used to lose every rating point it had earned. This is the largest gain
measured so far.

| Metric | Before | After |
| --- | ---: | ---: |
| Holdout log loss | 0.42762 | 0.42484 |
| Holdout Brier score | 0.13983 | 0.13880 |
| Holdout favorite accuracy | 79.50% | 79.51% |
| Tuning log loss | 0.46107 | 0.45984 |

The gain of 0.00278 is about ten times the margin of victory gain that was
rejected on 2026-08-05, and no parameter changed to earn it. Both windows moved
the same way, which separates this result from the parameter tests above, where
the two windows chose different values. MLflow run
`f837fb020b8a481c9a3c99b809e7cb04`.

Accuracy moved by 0.01 points. A view of the model through accuracy alone would
have shown nothing at all.

## Experiments to try next

Keep the season-reset, result-only model as the permanent baseline. Add one idea
at a time and compare it against held-out later seasons with a chronological
backtest.

### Rating mechanics

- Compare the linear provisional decay with an uncertainty-based or
  games-played curve, without tuning directly for an 80% accuracy threshold.
- Check whether the chosen values remain stable with rolling-origin validation
  rather than one tuning and validation boundary.

Changing every team's initial rating from 1500 to another shared number cannot
change predictions; Elo depends on rating differences. Initial rating
experiments only become meaningful with unequal priors or cross-season
carryover.

### Football context

- Revisit margin of victory only with multiple validation windows; keep its
  multiplier capped so one extreme score cannot dominate a season.
- Predict the score difference and convert it to a probability, rather than
  updating on the winner alone. This is a different model, not a parameter.

### Evaluation and monitoring

- Compare Brier score, log loss, favorite accuracy, and calibration error.
- Report metrics by season, week, division, home/away status, playoffs, and
  confidence bucket.
- Add simple baselines: constant 50%, always choosing the home team, and the
  higher-win-percentage team.
- Track rolling performance only after predictions are stored before kickoff;
  reconstructing old predictions from corrected data is useful for research but
  is not the same as production monitoring.
- Prefer walk-forward validation. A random train/test split leaks future team
  strength into earlier games and is not valid for this problem.

### Questions to answer with evidence

- How many games does a reset team need before its rating becomes useful?
- Does cross-season carryover improve early weeks without hurting later weeks?
- Are probabilities similarly calibrated across divisions?
- Does margin of victory improve probability quality or merely confidence?
- Which parameter choices remain stable across multiple held-out seasons?
