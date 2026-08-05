# Elo predictor

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

Build the dbt marts, start MLflow, and run the predictor:

```bash
make dbt-build
make mlflow-up
make elo-run
```

MLflow is available at <http://localhost:5000>. Each run records the Elo
parameters, data fingerprint, cutoff date, overall and per-season metrics, and
these CSV artifacts:

- `historical_predictions.csv`: each probability captured before its result
  updates the ratings.
- `current_ratings.csv`: final rating for every team-season in the run.
- `upcoming_predictions.csv`: probabilities for unknown games on or after the
  cutoff date.
- `run_summary.json`: compact configuration and evaluation summary.

Use `ARGS` to change the cutoff or deliberately run a parameter experiment:

```bash
make elo-run ARGS="--as-of-date 2026-08-20 --k-factor 24 --run-name k-24"
```

Run a chronological parameter sweep with comma-separated candidate values:

```bash
make elo-sweep ARGS="--parameter k_factor --values 96,128,160,192,224 --run-prefix k"
```

By default, sweeps tune on 2000–2021 and validate on 2022–2023. Games after
2023 are not processed by a sweep, which protects the 2024–2025 final holdout.
Override the windows with `--tuning-seasons 2000:2020` and
`--validation-seasons 2021:2023`. Sweep runs log parameters and window metrics
to MLflow without duplicating large CSV artifacts; a final `run` logs the full
artifacts and per-season metrics.

MLflow is only an experiment tracker here. This project does not use its model
registry or deployment features, and Elo does not need a serialized estimator.

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
make elo-run ARGS="--k-factor 148 --home-advantage 30 --season-carryover 0.85 --division-rating-step 140 --provisional-games 3 --provisional-k-multiplier 1.6 --run-name champion-v3-provisional"
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

## Experiments to try next

Keep the season-reset, result-only model as the permanent baseline. Add one idea
at a time and compare it against held-out later seasons with a chronological
backtest.

### Rating mechanics

- Tune the rating scale to change how rating differences map to probabilities.
- Compare the linear provisional decay with an uncertainty-based or
  games-played curve, without tuning directly for an 80% accuracy threshold.
- Check whether the chosen values remain stable with rolling-origin validation
  rather than one tuning and validation boundary.

Changing every team's initial rating from 1500 to another shared number cannot
change predictions; Elo depends on rating differences. Initial rating
experiments only become meaningful with unequal priors or cross-season
carryover.

### Football context

- Test division or playoff multipliers on K-factor.
- Revisit margin of victory only with multiple validation windows; keep its
  multiplier capped so one extreme score cannot dominate a season.
- Decide how forfeits and ties should affect ratings.

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
