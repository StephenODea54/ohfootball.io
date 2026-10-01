package store

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func TestScanCellReadsEveryColumn(t *testing.T) {
	first := time.Date(2026, 9, 24, 0, 0, 0, 0, time.UTC)
	last := time.Date(2026, 9, 26, 0, 0, 0, 0, time.UTC)
	cell, err := scanCell(fakeRow{
		2026, 6, false, 9, int64(120), int64(1), int64(119), int64(117), int64(4),
		1.5, 8.25, 117.6, 116.6, first, last,
	})
	if err != nil {
		t.Fatalf("scanCell: %v", err)
	}
	if cell.Season != 2026 || cell.Week != 6 || cell.Playoff || cell.Bin != 9 {
		t.Fatalf("cell = %+v, want bin 9 of week 6 of 2026", cell)
	}
	if cell.Games != 120 || cell.Ties != 1 || cell.Decided != 119 || cell.Correct != 117 {
		t.Fatalf("cell = %+v, want 120 games, 1 tie, 119 decided, 117 correct", cell)
	}
	if cell.ExactMargins != 4 {
		t.Fatalf("cell = %+v, want 4 exact margins", cell)
	}
	if cell.SumSquaredError != 1.5 || cell.SumLogLoss != 8.25 || cell.SumFavoriteProbability != 117.6 ||
		cell.SumFavoriteProbabilityDecided != 116.6 {
		t.Fatalf("cell = %+v, want the sums it was given", cell)
	}
	if cell.FirstDate != "2026-09-24" || cell.LastDate != "2026-09-26" {
		t.Fatalf("cell = %+v, want 2026-09-24 to 2026-09-26", cell)
	}
	if _, err := scanCell(fakeRow{2026}); err == nil {
		t.Fatal("scanCell of a short row gave no error")
	}
	// A row of the cells without the count of exact margins is one column short.
	if _, err := scanCell(fakeRow{
		2026, 6, false, 9, int64(120), int64(1), int64(119), int64(117),
		1.5, 8.25, 117.6, 116.6, first, last,
	}); err == nil {
		t.Fatal("scanCell of a row without the exact margins gave no error")
	}
}

func TestScanPendingReadsTheWeek(t *testing.T) {
	pending, err := scanPending(fakeRow{2026, 7, int64(357)})
	if err != nil || pending.Season != 2026 || pending.Week != 7 || pending.Games != 357 {
		t.Fatalf("scanPending = %+v, %v, want 357 games in week 7 of 2026", pending, err)
	}
	if _, err := scanPending(fakeRow{2026}); err == nil {
		t.Fatal("scanPending of a short row gave no error")
	}
}

func scoredGameRow(winnerScore, loserScore any) fakeRow {
	return fakeRow{
		"game", 2011, 6, time.Date(2011, 9, 30, 0, 0, 0, 0, time.UTC),
		"greenville", "678", "Greenville", winnerScore,
		"watterson", "1720", "Bishop Watterson", loserScore,
		0.0037, -12.4,
	}
}

func TestScanScoredGameReadsTheWinnerAndTheLoser(t *testing.T) {
	game, err := scanScoredGame(scoredGameRow(int64(14), int64(7)))
	if err != nil {
		t.Fatalf("scanScoredGame: %v", err)
	}
	if game.ID != "game" || game.Season != 2011 || game.Week != 6 || game.Date != "2011-09-30" {
		t.Fatalf("game = %+v, want week 6 of 2011 on 2011-09-30", game)
	}
	if game.Winner.ID != "greenville" || game.Winner.SourceID != "678" || game.Winner.Name != "Greenville" ||
		*game.Winner.Score != 14 {
		t.Fatalf("winner = %+v, want Greenville with 14", game.Winner)
	}
	if game.Loser.Name != "Bishop Watterson" || *game.Loser.Score != 7 {
		t.Fatalf("loser = %+v, want Bishop Watterson with 7", game.Loser)
	}
	if game.WinnerProbability != 0.0037 {
		t.Fatalf("game = %+v, want 0.37%%", game)
	}
	if game.WinnerPredictedMargin != -12.4 {
		t.Fatalf("game = %+v, want a predicted margin of -12.4 for the winner", game)
	}

	noScores, err := scanScoredGame(scoredGameRow(nil, nil))
	if err != nil || noScores.Winner.Score != nil || noScores.Loser.Score != nil {
		t.Fatalf("game without scores = %+v, %v, want null scores", noScores, err)
	}
	if _, err := scanScoredGame(fakeRow{"game"}); err == nil {
		t.Fatal("scanScoredGame of a short row gave no error")
	}
}

// fakeRows gives fixed rows to scanRows.
type fakeRows struct {
	rows   []fakeRow
	next   int
	err    error
	closed bool
}

func (rows *fakeRows) Next() bool {
	rows.next++
	return rows.next <= len(rows.rows)
}

func (rows *fakeRows) Scan(dest ...any) error { return rows.rows[rows.next-1].Scan(dest...) }
func (rows *fakeRows) Err() error             { return rows.err }
func (rows *fakeRows) Close()                 { rows.closed = true }

func TestScanRowsReadsEveryRowAndClosesTheRows(t *testing.T) {
	rows := &fakeRows{rows: []fakeRow{{2026, 7, int64(3)}, {2026, 8, int64(4)}}}
	pending, err := scanRows(rows, "pending", scanPending)
	if err != nil || len(pending) != 2 || pending[1].Games != 4 || !rows.closed {
		t.Fatalf("scanRows = %+v, %v, closed %t, want 2 rows and closed rows", pending, err, rows.closed)
	}

	empty, err := scanRows(&fakeRows{}, "pending", scanPending)
	if err != nil || empty == nil || len(empty) != 0 {
		t.Fatalf("scanRows of no rows = %v, %v, want an empty list", empty, err)
	}

	bad := &fakeRows{rows: []fakeRow{{2026}}}
	_, err = scanRows(bad, "pending", scanPending)
	if err == nil || !strings.Contains(err.Error(), "scan pending") || !bad.closed {
		t.Fatalf("error = %v, closed %t, want a scan error and closed rows", err, bad.closed)
	}

	failed := &fakeRows{err: errors.New("connection reset")}
	if _, err := scanRows(failed, "pending", scanPending); err == nil || !strings.Contains(err.Error(), "pending rows") {
		t.Fatalf("error = %v, want the error of the rows", err)
	}
}

// The scores must follow the rules of the evaluate command of the rating service.
func TestAccuracyQueriesFollowTheRulesOfTheRatingService(t *testing.T) {
	for name, query := range map[string]string{
		"cells": accuracyCellsSQL, "upsets": accuracyUpsetsSQL, "exact margins": accuracyExactMarginsSQL,
	} {
		for _, rule := range []string{
			"game.team_a_result IN ('W', 'L', 'T')",
			"NOT IN ('forfeit', 'double forfeit')",
			"prediction.as_of_date <= date.date_day",
			"game.is_current",
			"LEAST(GREATEST(scored.probability, 1e-15), 1 - 1e-15)",
		} {
			if !strings.Contains(query, rule) {
				t.Errorf("the %s query does not hold %q", name, rule)
			}
		}
	}
	if !strings.Contains(accuracyPendingSQL, "COALESCE(game.team_a_result, 'unknown') = 'unknown'") {
		t.Error("the pending query does not count only the games without a result")
	}
}

// Every query that numbers weeks must read the one rule of week.go.
func TestAccuracyQueriesNumberWeeksWithTheSharedRule(t *testing.T) {
	for name, query := range map[string]string{
		"cells": accuracyCellsSQL, "upsets": accuracyUpsetsSQL, "exact margins": accuracyExactMarginsSQL,
		"pending": accuracyPendingSQL,
	} {
		if !strings.Contains(query, weekNumberSQL) || !strings.Contains(query, "INNER JOIN season_starts") {
			t.Errorf("the %s query does not number weeks with the shared rule", name)
		}
		// One for the start of the season and one for the game.
		if count := strings.Count(query, "DATE_TRUNC('week'"); count != 2 {
			t.Errorf("the %s query truncates to a week %d times, want 2", name, count)
		}
	}
}

// An exact margin must round as the site rounds: a half rounds up, with no cast to numeric.
func TestExactMarginsRoundAsTheSite(t *testing.T) {
	for _, part := range []string{
		"FLOOR(scored.winner_margin + 0.5) = scored.final_margin",
		"scored.winner_margin >= 0.5",
		"scored.outcome <> 0.5",
	} {
		if !strings.Contains(scoredPredictionsCTE, part) {
			t.Errorf("the scored predictions do not hold %q", part)
		}
	}
	if strings.Contains(scoredPredictionsCTE, "ROUND(") {
		t.Error("the scored predictions round with ROUND, which rounds a half to even")
	}
	if !strings.Contains(accuracyCellsSQL, "COUNT(*) FILTER (WHERE exact_margin)") {
		t.Error("the cells query does not count the exact margins")
	}
}

// The spread of the ratings of a season must not depend on the week of the list.
func TestSeasonSpreadReadsTheWholeSeason(t *testing.T) {
	start := strings.Index(accuracyExactMarginsSQL, "season_spread AS (")
	if start < 0 {
		t.Fatal("the exact margins query has no season_spread")
	}
	end := strings.Index(accuracyExactMarginsSQL[start:], "GROUP BY graded.season")
	if end < 0 {
		t.Fatal("season_spread does not group by season")
	}
	if spread := accuracyExactMarginsSQL[start : start+end]; strings.Contains(spread, "$3") {
		t.Errorf("season_spread reads the week: %s", spread)
	}
}

func TestExactMarginsPutTheBiggestGamesFirst(t *testing.T) {
	at := strings.LastIndex(accuracyExactMarginsSQL, "ORDER BY")
	if at < 0 {
		t.Fatal("the exact margins query has no order")
	}
	order := accuracyExactMarginsSQL[at:]
	spread := strings.Index(order, "NULLIF(season_spread.spread, 0) DESC NULLS LAST")
	playoff := strings.Index(order, "sided.is_playoff_game DESC")
	if spread < 0 || playoff < spread {
		t.Errorf("order = %s, want the size of the game, then the playoff game first", order)
	}
	if !strings.Contains(accuracyExactMarginsSQL, "WHERE sided.exact_margin") {
		t.Error("the exact margins query does not keep only the exact margins")
	}
	if !strings.HasSuffix(strings.TrimSpace(accuracyUpsetsSQL),
		"ORDER BY winner_probability, sided.game_date, sided.game_key\n\tLIMIT $4::int") {
		t.Error("the upsets query does not put the lowest winner probability first")
	}
}
