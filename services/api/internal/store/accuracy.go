package store

import (
	"context"
	"fmt"
	"time"

	"github.com/StephenODea54/services/api/graph/model"
	"github.com/StephenODea54/services/api/internal/accuracy"
	"github.com/jackc/pgx/v5/pgtype"
)

// accuracyKey names one answer of ModelAccuracy.
type accuracyKey struct {
	current int
	r       accuracy.Range
}

// ModelAccuracy scores the stored predictions of the games that have a result. The SQL sums the
// predictions into cells, and the package accuracy folds the cells into each view. Two more
// queries give the lists of upsets, and two more give the lists of exact margins. The answer of
// each range is kept for accuracyCacheTTL, and calls for the same range at the same time share
// one load, because the load reads every stored prediction and the predictions change once a
// week.
func (store *Postgres) ModelAccuracy(ctx context.Context, from, to *int) (*model.ModelAccuracy, error) {
	current, err := store.CurrentSeason(ctx)
	if err != nil {
		return nil, err
	}
	r, err := accuracy.ResolveRange(current, from, to)
	if err != nil {
		return nil, err
	}
	// A shared load must not stop when the first caller goes away, because other callers wait
	// for it.
	loadContext := context.WithoutCancel(ctx)
	return store.accuracyAnswers.get(accuracyKey{current, r}, func() (*model.ModelAccuracy, error) {
		return store.loadModelAccuracy(loadContext, current, r)
	})
}

func (store *Postgres) loadModelAccuracy(ctx context.Context, current int, r accuracy.Range) (*model.ModelAccuracy, error) {
	cells, err := collect(ctx, store, "select accuracy cells", accuracyCellsSQL, nil, scanCell)
	if err != nil {
		return nil, err
	}
	pending, err := collect(ctx, store, "select pending games", accuracyPendingSQL, nil, scanPending)
	if err != nil {
		return nil, err
	}
	upsets, err := collect(ctx, store, "select upsets", accuracyUpsetsSQL,
		[]any{r.From, r.To, nil, accuracy.ListLimit}, scanScoredGame)
	if err != nil {
		return nil, err
	}
	exactMargins, err := collect(ctx, store, "select exact margins", accuracyExactMarginsSQL,
		[]any{r.From, r.To, nil, accuracy.ListLimit}, scanScoredGame)
	if err != nil {
		return nil, err
	}
	report := accuracy.Report(cells, pending, current)
	if week := report.LastWeek; week != nil {
		report.LastWeekUpsets, err = collect(ctx, store, "select upsets of the last week", accuracyUpsetsSQL,
			[]any{current, current, week.Week, accuracy.LastWeekUpsets}, scanScoredGame)
		if err != nil {
			return nil, err
		}
		report.LastWeekExactMarginGames, err = collect(ctx, store, "select exact margins of the last week",
			accuracyExactMarginsSQL, []any{current, current, week.Week, accuracy.LastWeekExactMargins},
			scanScoredGame)
		if err != nil {
			return nil, err
		}
	}
	return accuracy.Assemble(cells, pending, current, r, upsets, exactMargins, report), nil
}

// collect runs a query and scans each row with scan.
func collect[T any](
	ctx context.Context,
	store *Postgres,
	name, query string,
	arguments []any,
	scan func(rowScanner) (T, error),
) ([]T, error) {
	rows, err := store.client.Query(ctx, query, arguments...)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", name, err)
	}
	return scanRows(rows, name, scan)
}

// rowIterator is the part of pgx.Rows that scanRows reads, so a test can give it fixed rows.
type rowIterator interface {
	rowScanner
	Next() bool
	Err() error
	Close()
}

// scanRows reads every row with scan and closes the rows.
func scanRows[T any](rows rowIterator, name string, scan func(rowScanner) (T, error)) ([]T, error) {
	defer rows.Close()
	result := make([]T, 0)
	for rows.Next() {
		value, err := scan(rows)
		if err != nil {
			return nil, fmt.Errorf("scan %s: %w", name, err)
		}
		result = append(result, value)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("%s rows: %w", name, err)
	}
	return result, nil
}

func scanCell(row rowScanner) (accuracy.Cell, error) {
	var cell accuracy.Cell
	var games, ties, decided, correct, exactMargins int64
	var firstDate, lastDate time.Time
	if err := row.Scan(
		&cell.Season,
		&cell.Week,
		&cell.Playoff,
		&cell.Bin,
		&games,
		&ties,
		&decided,
		&correct,
		&exactMargins,
		&cell.SumSquaredError,
		&cell.SumLogLoss,
		&cell.SumFavoriteProbability,
		&cell.SumFavoriteProbabilityDecided,
		&firstDate,
		&lastDate,
	); err != nil {
		return accuracy.Cell{}, err
	}
	cell.Games, cell.Ties, cell.Decided, cell.Correct = int(games), int(ties), int(decided), int(correct)
	cell.ExactMargins = int(exactMargins)
	cell.FirstDate = firstDate.Format(time.DateOnly)
	cell.LastDate = lastDate.Format(time.DateOnly)
	return cell, nil
}

func scanPending(row rowScanner) (accuracy.Pending, error) {
	var pending accuracy.Pending
	var games int64
	if err := row.Scan(&pending.Season, &pending.Week, &games); err != nil {
		return accuracy.Pending{}, err
	}
	pending.Games = int(games)
	return pending, nil
}

func scanScoredGame(row rowScanner) (*model.ScoredGame, error) {
	game := model.ScoredGame{Winner: &model.ScoredTeam{}, Loser: &model.ScoredTeam{}}
	var gameDate time.Time
	var winnerScore, loserScore pgtype.Int4
	if err := row.Scan(
		&game.ID,
		&game.Season,
		&game.Week,
		&gameDate,
		&game.Winner.ID,
		&game.Winner.SourceID,
		&game.Winner.Name,
		&winnerScore,
		&game.Loser.ID,
		&game.Loser.SourceID,
		&game.Loser.Name,
		&loserScore,
		&game.WinnerProbability,
		&game.WinnerPredictedMargin,
	); err != nil {
		return nil, err
	}
	game.Date = gameDate.Format(time.DateOnly)
	game.Winner.Score = optional(winnerScore.Valid, int(winnerScore.Int32))
	game.Loser.Score = optional(loserScore.Valid, int(loserScore.Int32))
	return &game, nil
}

// ohioGameJoinsSQL keeps only the games between two current Ohio teams. The predictions also hold
// the games against teams from other states, and the evaluate command of the rating service does
// not score them.
var ohioGameJoinsSQL = `
		INNER JOIN ohfootball_marts.dim_teams AS team_a
			ON team_a.team_key = game.team_a_key AND team_a.is_current AND team_a.state_code = 'OH'
		INNER JOIN ohfootball_marts.dim_teams AS team_b
			ON team_b.team_key = game.team_b_key AND team_b.is_current AND team_b.state_code = 'OH'`

// scoredPredictionsCTE gives one row for each scored prediction. The rules are those of the
// evaluate command of the rating service: a game between two Ohio teams, a result of W, L, or T,
// no forfeit, and a prediction made no later than the day of the game.
var scoredPredictionsCTE = `
	WITH ` + seasonStartsCTE + `,
	scored AS (
		SELECT
			game.game_key,
			game.season,
			date.date_day AS game_date,
			` + weekNumberSQL + ` AS week,
			COALESCE(game.is_playoff_game, FALSE) AS is_playoff_game,
			prediction.team_a_win_probability AS probability,
			(CASE game.team_a_result WHEN 'W' THEN 1 WHEN 'T' THEN 0.5 ELSE 0 END)::float8 AS outcome,
			game.team_a_key,
			game.team_b_key,
			game.team_a_score,
			game.team_b_score,
			prediction.team_a_rating,
			prediction.team_b_rating,
			CASE game.team_a_result WHEN 'W' THEN prediction.predicted_margin
				ELSE -prediction.predicted_margin END AS winner_margin,
			CASE game.team_a_result WHEN 'W' THEN game.team_a_score - game.team_b_score
				ELSE game.team_b_score - game.team_a_score END AS final_margin
		FROM ohfootball_marts.fct_game_predictions AS prediction
		INNER JOIN ohfootball_marts.fct_games AS game
			ON game.game_key = prediction.game_key AND game.is_current` + ohioGameJoinsSQL + `
		INNER JOIN ohfootball_marts.dim_dates AS date
			ON date.date_key = game.game_date_key
		INNER JOIN season_starts
			ON season_starts.season = game.season
		WHERE game.team_a_result IN ('W', 'L', 'T')
		  AND LOWER(TRIM(COALESCE(game.notes, ''))) NOT IN ('forfeit', 'double forfeit')
		  AND prediction.as_of_date <= date.date_day
	),
	graded AS (
		SELECT
			scored.*,
			GREATEST(scored.probability, 1 - scored.probability) AS favorite_probability,
			-- A tie is not a win, and a forecast of exactly 0.5 picks no team.
			(scored.probability <> 0.5 AND scored.outcome <> 0.5) AS decided,
			(scored.probability <> 0.5 AND scored.outcome <> 0.5
				AND (scored.probability > 0.5) = (scored.outcome = 1)) AS correct,
			-- The same clip as the rating service. The table refuses 0 and 1, so it changes
			-- nothing today.
			LEAST(GREATEST(scored.probability, 1e-15), 1 - 1e-15) AS clipped,
			-- The model called the margin exactly when the margin that it expected for the
			-- winner, rounded as the site rounds it, is the final margin. The site uses
			-- Math.round, which rounds a half up. ROUND of a float8 rounds a half to even. A cast
			-- to numeric keeps only 15 digits, so 2.4999999999999996 becomes 3. FLOOR of the
			-- margin plus 0.5 rounds as the site does. The site shows a margin under 0.5 as
			-- "Even", which calls no margin. A tie has no winner. A game without both scores
			-- has no final margin, so it does not count.
			COALESCE(scored.outcome <> 0.5 AND scored.winner_margin >= 0.5
				AND FLOOR(scored.winner_margin + 0.5) = scored.final_margin, FALSE) AS exact_margin
		FROM scored
	)
`

// accuracyCellsSQL sums the scored predictions by season, week, playoff flag, and bin. The bin of
// a favorite probability p is floor(20p) - 10, and 1 falls in the last bin.
var accuracyCellsSQL = scoredPredictionsCTE + `
	SELECT
		season,
		week,
		is_playoff_game,
		LEAST(FLOOR(favorite_probability * 20) - 10, 9)::int AS bin,
		COUNT(*),
		COUNT(*) FILTER (WHERE outcome = 0.5),
		COUNT(*) FILTER (WHERE decided),
		COUNT(*) FILTER (WHERE correct),
		COUNT(*) FILTER (WHERE exact_margin),
		SUM(POWER(probability - outcome, 2)),
		SUM(-(outcome * LN(clipped) + (1 - outcome) * LN(1 - clipped))),
		SUM(favorite_probability),
		COALESCE(SUM(favorite_probability) FILTER (WHERE decided), 0),
		MIN(game_date),
		MAX(game_date)
	FROM graded
	GROUP BY season, week, is_playoff_game, bin
	ORDER BY season, week, is_playoff_game, bin
`

// accuracyPendingSQL counts the predicted games between two Ohio teams that have no result yet, by
// season and week.
var accuracyPendingSQL = `
	WITH ` + seasonStartsCTE + `
	SELECT game.season, ` + weekNumberSQL + ` AS week, COUNT(*)
	FROM ohfootball_marts.fct_game_predictions AS prediction
	INNER JOIN ohfootball_marts.fct_games AS game
		ON game.game_key = prediction.game_key AND game.is_current` + ohioGameJoinsSQL + `
	INNER JOIN ohfootball_marts.dim_dates AS date
		ON date.date_key = game.game_date_key
	INNER JOIN season_starts
		ON season_starts.season = game.season
	WHERE COALESCE(game.team_a_result, 'unknown') = 'unknown'
	GROUP BY game.season, week
	ORDER BY game.season, week
`

// sidedGamesSQL gives the scored games with a winner, in a range of seasons, in one week or in
// every week. The parameters are the first and the last season, a week or null, and the number of
// games, which the query that reads it applies.
var sidedGamesSQL = scoredPredictionsCTE + `,
	sided AS (
		SELECT
			graded.*,
			graded.outcome = 1 AS a_won
		FROM graded
		WHERE graded.outcome <> 0.5
		  AND graded.season BETWEEN $1::int AND $2::int
		  AND ($3::int IS NULL OR graded.week = $3::int)
	)
`

// scoredGameSQL reads the games of sided from the winner, in the columns of scanScoredGame.
var scoredGameSQL = `
	SELECT
		sided.game_key::text,
		sided.season,
		sided.week,
		sided.game_date,
		winner.team_key::text,
		winner.source_id,
		winner.name,
		CASE WHEN sided.a_won THEN sided.team_a_score ELSE sided.team_b_score END,
		loser.team_key::text,
		loser.source_id,
		loser.name,
		CASE WHEN sided.a_won THEN sided.team_b_score ELSE sided.team_a_score END,
		CASE WHEN sided.a_won THEN sided.probability ELSE 1 - sided.probability END
			AS winner_probability,
		sided.winner_margin
	FROM sided
	INNER JOIN ohfootball_marts.dim_teams AS winner
		ON winner.is_current
	   AND winner.team_key = CASE WHEN sided.a_won THEN sided.team_a_key ELSE sided.team_b_key END
	INNER JOIN ohfootball_marts.dim_teams AS loser
		ON loser.is_current
	   AND loser.team_key = CASE WHEN sided.a_won THEN sided.team_b_key ELSE sided.team_a_key END
`

// accuracyUpsetsSQL lists the scored games with a winner, lowest winner probability first.
var accuracyUpsetsSQL = sidedGamesSQL + scoredGameSQL + `
	ORDER BY winner_probability, sided.game_date, sided.game_key
	LIMIT $4::int
`

// accuracyExactMarginsSQL lists the scored games in which the model called the margin exactly,
// biggest games first. The size of a game is the sum of the gaps of the two ratings to the mean
// rating of the season, in standard deviations of the season. The mean and the deviation use
// every scored game of the season, whatever the week. Of two games that are as big, the playoff
// game comes first.
var accuracyExactMarginsSQL = sidedGamesSQL + `,
	season_spread AS (
		SELECT graded.season, AVG(side.rating) AS mean_rating, STDDEV_POP(side.rating) AS spread
		FROM graded
		CROSS JOIN LATERAL (VALUES (graded.team_a_rating), (graded.team_b_rating)) AS side (rating)
		WHERE graded.season BETWEEN $1::int AND $2::int
		GROUP BY graded.season
	)
` + scoredGameSQL + `
	INNER JOIN season_spread ON season_spread.season = sided.season
	WHERE sided.exact_margin
	ORDER BY (sided.team_a_rating + sided.team_b_rating - 2 * season_spread.mean_rating)
			/ NULLIF(season_spread.spread, 0) DESC NULLS LAST,
		sided.is_playoff_game DESC, sided.game_date, sided.game_key
	LIMIT $4::int
`
