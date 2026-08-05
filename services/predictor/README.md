# Elo predictor

This service turns the canonical game history in `ohfootball_marts.fct_games`
into pregame win probabilities. The first version intentionally implements a
plain, inspectable Elo baseline before adding football-specific assumptions.

## Version 1 behavior

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

## Experiments to try later

Keep the season-reset, result-only model as the permanent baseline. Add one idea
at a time and compare it against held-out later seasons with a chronological
backtest.

### Rating mechanics

- Tune the K-factor to control how quickly recent results replace prior belief.
- Tune the rating scale to change how rating differences map to probabilities.
- Compare a fixed K-factor with one that changes by week or games played.
- Add offseason regression toward 1500 after durable cross-season program
  identities exist.

Changing every team's initial rating from 1500 to another shared number cannot
change predictions; Elo depends on rating differences. Initial rating
experiments only become meaningful with unequal priors or cross-season
carryover.

### Football context

- Estimate a home-field rating adjustment.
- Test division-based starting priors without hard-coding an assumed ordering.
- Test division or playoff multipliers on K-factor.
- Add a margin-of-victory multiplier and cap it so one extreme score cannot
  dominate a season.
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
