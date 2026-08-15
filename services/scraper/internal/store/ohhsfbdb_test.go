package store

import (
	"context"
	"testing"

	"github.com/StephenODea54/services/scraper/internal/ohhsfbdb"
	"github.com/jackc/pgx/v5/pgtype"
)

// removeOhhsfbdbRun deletes what one test wrote. The sink owns its own
// transaction, so a test cannot wrap its work in one and roll it back.
func removeOhhsfbdbRun(t *testing.T, store *Store, runID pgtype.UUID) {
	t.Helper()
	t.Cleanup(func() {
		ctx := context.Background()
		for _, statement := range []string{
			"DELETE FROM ohfootball_raw.ohhsfbdb_games WHERE scrape_run_id = $1",
			"DELETE FROM ohfootball_raw.ohhsfbdb_season_summaries WHERE scrape_run_id = $1",
			"DELETE FROM ohfootball_raw.ohhsfbdb_teams WHERE scrape_run_id = $1",
			"DELETE FROM ohfootball_raw.ohhsfbdb_index WHERE scrape_run_id = $1",
			"DELETE FROM ohfootball_metadata.scrape_runs WHERE id = $1",
		} {
			if _, err := store.pool.Exec(ctx, statement, runID); err != nil {
				t.Errorf("clean up after the test: %v", err)
			}
		}
	})
}

func countRows(t *testing.T, store *Store, table string, runID pgtype.UUID) int {
	t.Helper()
	var count int
	query := "SELECT count(*) FROM ohfootball_raw." + table + " WHERE scrape_run_id = $1"
	if err := store.pool.QueryRow(context.Background(), query, runID).Scan(&count); err != nil {
		t.Fatalf("count the rows of %s: %v", table, err)
	}
	return count
}

func startOhhsfbdbRun(t *testing.T, store *Store) pgtype.UUID {
	t.Helper()
	runID, err := store.StartRun(context.Background(), "ohhsfbdb-store-test", "https://example.com")
	if err != nil {
		t.Fatalf("StartRun returned %v", err)
	}
	removeOhhsfbdbRun(t, store, runID)
	return runID
}

func TestWriteIndexStoresEveryEntryIncludingARepeatedSheet(t *testing.T) {
	store := openStore(t)
	runID := startOhhsfbdbRun(t, store)

	entries := []ohhsfbdb.IndexEntry{
		{Position: 1, Name: "Dayton Fairview", Sheet: "sheet739"},
		{Position: 2, Name: "Dayton Roosevelt", Sheet: "sheet739"},
		{Position: 3, Name: "Ada", Sheet: "sheet002"},
	}
	if err := store.ForOhhsfbdbRun(runID).WriteIndex(context.Background(), entries); err != nil {
		t.Fatalf("WriteIndex returned %v", err)
	}
	if got := countRows(t, store, "ohhsfbdb_index", runID); got != 3 {
		t.Errorf("stored %d index rows, want 3", got)
	}
}

func TestWriteIndexAcceptsNoEntry(t *testing.T) {
	store := openStore(t)
	runID := startOhhsfbdbRun(t, store)

	if err := store.ForOhhsfbdbRun(runID).WriteIndex(context.Background(), nil); err != nil {
		t.Fatalf("WriteIndex returned %v", err)
	}
	if got := countRows(t, store, "ohhsfbdb_index", runID); got != 0 {
		t.Errorf("stored %d index rows, want 0", got)
	}
}

func TestWriteSheetStoresTheSchoolItsGamesAndItsSeasonRecords(t *testing.T) {
	store := openStore(t)
	runID := startOhhsfbdbRun(t, store)
	ctx := context.Background()

	team := ohhsfbdb.SheetTeam{Sheet: "sheet002", Number: "100", ShortName: "Ada"}
	games := []ohhsfbdb.GameRow{
		{
			Sheet: "sheet002", Season: 1972, Week: "1", GameDate: "9/8/72", DayOfWeek: "Fri",
			HomeAway: "A", OpponentName: "Delphos Jefferson", OpponentSheet: "sheet175",
			TeamScore: "38", OpponentScore: "0", Result: "W", Stadium: "Stadium Park",
		},
		{
			Sheet: "sheet002", Season: 1994, Week: "11", GameDate: "11/12/94", DayOfWeek: "Sat",
			HomeAway: "N", OpponentName: "Delphos St. John's", TeamScore: "7",
			OpponentScore: "46", Result: "L", PlayoffRound: "Regional Semifinal",
		},
	}
	summaries := []ohhsfbdb.SeasonSummaryRow{
		{Sheet: "sheet002", Season: 1972, Conference: "Northwest", RegularWins: "8", Rank: "7"},
	}

	if err := store.ForOhhsfbdbRun(runID).WriteSheet(ctx, team, games, summaries); err != nil {
		t.Fatalf("WriteSheet returned %v", err)
	}

	if got := countRows(t, store, "ohhsfbdb_teams", runID); got != 1 {
		t.Errorf("stored %d schools, want 1", got)
	}
	if got := countRows(t, store, "ohhsfbdb_games", runID); got != 2 {
		t.Errorf("stored %d games, want 2", got)
	}
	if got := countRows(t, store, "ohhsfbdb_season_summaries", runID); got != 1 {
		t.Errorf("stored %d season records, want 1", got)
	}

	// The ground of a game on neither field is kept as the site wrote it.
	var ground string
	err := store.pool.QueryRow(ctx,
		"SELECT home_away FROM ohfootball_raw.ohhsfbdb_games WHERE scrape_run_id = $1 AND season = 1994",
		runID).Scan(&ground)
	if err != nil {
		t.Fatalf("read the ground of the game: %v", err)
	}
	if ground != "N" {
		t.Errorf("the ground is %q, want %q", ground, "N")
	}
}

// A sheet whose seasons all fall outside the backfill still names its school.
func TestWriteSheetStoresASchoolWithNoGame(t *testing.T) {
	store := openStore(t)
	runID := startOhhsfbdbRun(t, store)

	team := ohhsfbdb.SheetTeam{Sheet: "sheet900", ShortName: "Late Starter"}
	if err := store.ForOhhsfbdbRun(runID).WriteSheet(context.Background(), team, nil, nil); err != nil {
		t.Fatalf("WriteSheet returned %v", err)
	}
	if got := countRows(t, store, "ohhsfbdb_teams", runID); got != 1 {
		t.Errorf("stored %d schools, want 1", got)
	}
	if got := countRows(t, store, "ohhsfbdb_games", runID); got != 0 {
		t.Errorf("stored %d games, want 0", got)
	}
}

// A school that closed before joeeitel.com began carries no identifier, and the
// column holds null rather than an empty string.
func TestWriteSheetStoresNoIdentifierAsNull(t *testing.T) {
	store := openStore(t)
	runID := startOhhsfbdbRun(t, store)
	ctx := context.Background()

	team := ohhsfbdb.SheetTeam{Sheet: "sheet725", ShortName: "Cathedral Latin"}
	if err := store.ForOhhsfbdbRun(runID).WriteSheet(ctx, team, nil, nil); err != nil {
		t.Fatalf("WriteSheet returned %v", err)
	}

	var number *string
	err := store.pool.QueryRow(ctx,
		"SELECT team_number FROM ohfootball_raw.ohhsfbdb_teams WHERE scrape_run_id = $1", runID).Scan(&number)
	if err != nil {
		t.Fatalf("read the identifier: %v", err)
	}
	if number != nil {
		t.Errorf("the identifier is %q, want null", *number)
	}
}

// The sheet reaches the database whole or not at all. A game that names no
// sheet breaks the not null rule, and the school must not survive it.
func TestWriteSheetStoresNothingWhenARowIsRejected(t *testing.T) {
	store := openStore(t)
	runID := startOhhsfbdbRun(t, store)

	team := ohhsfbdb.SheetTeam{Sheet: "sheet002", Number: "100", ShortName: "Ada"}
	games := []ohhsfbdb.GameRow{{Sheet: "", Season: 1972}}

	if err := store.ForOhhsfbdbRun(runID).WriteSheet(context.Background(), team, games, nil); err == nil {
		t.Fatal("WriteSheet returned no error for a game that names no sheet")
	}
	if got := countRows(t, store, "ohhsfbdb_teams", runID); got != 0 {
		t.Errorf("stored %d schools after the transaction failed, want 0", got)
	}
}
