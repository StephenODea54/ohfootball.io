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
// queries give the lists of upsets. The answer of each range is kept for accuracyCacheTTL, and
// calls for the same range at the same time share one load, because the load reads every stored
// prediction and the predictions change once a week.
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
	upsets, err := collect(ctx, store, "select upsets", accuracyGamesSQL,
		[]any{r.From, r.To, nil, accuracy.ListLimit}, scanScoredGame)
	if err != nil {
		return nil, err
	}
	report := accuracy.Report(cells, pending, current)
	if week := report.LastWeek; week != nil {
		report.LastWeekUpsets, err = collect(ctx, store, "select upsets of the last week", accuracyGamesSQL,
			[]any{current, current, week.Week, accuracy.LastWeekUpsets}, scanScoredGame)
		if err != nil {
			return nil, err
		}
	}
	return accuracy.Assemble(cells, pending, current, r, upsets, report), nil
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
	var games, ties, decided, correct int64
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
	); err != nil {
		return nil, err
	}
	game.Date = gameDate.Format(time.DateOnly)
	game.Winner.Score = optional(winnerScore.Valid, int(winnerScore.Int32))
	game.Loser.Score = optional(loserScore.Valid, int(loserScore.Int32))
	return &game, nil
}

// scoredPredictionsCTE gives one row for each scored prediction. The rules are those of the
// evaluate command of the rating service: a result of W, L, or T, no forfeit, and a prediction
// made no later than the day of the game. Only a game between two Ohio teams has a prediction.
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
			game.team_b_score
		FROM ohfootball_marts.fct_game_predictions AS prediction
		INNER JOIN ohfootball_marts.fct_games AS game
			ON game.game_key = prediction.game_key AND game.is_current
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
			LEAST(GREATEST(scored.probability, 1e-15), 1 - 1e-15) AS clipped
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

// accuracyPendingSQL counts the predicted games that have no result yet, by season and week.
var accuracyPendingSQL = `
	WITH ` + seasonStartsCTE + `
	SELECT game.season, ` + weekNumberSQL + ` AS week, COUNT(*)
	FROM ohfootball_marts.fct_game_predictions AS prediction
	INNER JOIN ohfootball_marts.fct_games AS game
		ON game.game_key = prediction.game_key AND game.is_current
	INNER JOIN ohfootball_marts.dim_dates AS date
		ON date.date_key = game.game_date_key
	INNER JOIN season_starts
		ON season_starts.season = game.season
	WHERE COALESCE(game.team_a_result, 'unknown') = 'unknown'
	GROUP BY game.season, week
	ORDER BY game.season, week
`

// accuracyGamesSQL lists the scored games with a winner, seen from the winner, lowest winner
// probability first. The parameters are the first and the last season, a week or null, and the
// number of games.
var accuracyGamesSQL = scoredPredictionsCTE + `,
	sided AS (
		SELECT
			graded.*,
			graded.outcome = 1 AS a_won
		FROM graded
		WHERE graded.outcome <> 0.5
		  AND graded.season BETWEEN $1::int AND $2::int
		  AND ($3::int IS NULL OR graded.week = $3::int)
	)
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
			AS winner_probability
	FROM sided
	INNER JOIN ohfootball_marts.dim_teams AS winner
		ON winner.is_current
	   AND winner.team_key = CASE WHEN sided.a_won THEN sided.team_a_key ELSE sided.team_b_key END
	INNER JOIN ohfootball_marts.dim_teams AS loser
		ON loser.is_current
	   AND loser.team_key = CASE WHEN sided.a_won THEN sided.team_b_key ELSE sided.team_a_key END
	ORDER BY winner_probability, sided.game_date, sided.game_key
	LIMIT $4::int
`
