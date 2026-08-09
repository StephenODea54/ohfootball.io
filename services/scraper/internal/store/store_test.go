package store

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/StephenODea54/services/scraper/internal/joeeitel"
	"github.com/jackc/pgx/v5/pgtype"
)

// openStore connects to the development database. WriteTeam owns its own
// transaction, so a test cannot wrap its work in one transaction and roll it
// back. The test deletes its rows instead. Without that a run with the status
// succeeded would feed test teams to the analytics layer.
func openStore(t *testing.T) *Store {
	t.Helper()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL is not set")
	}

	store, err := New(context.Background(), databaseURL, 4)
	if err != nil {
		t.Fatalf("New returned %v", err)
	}
	t.Cleanup(store.Close)
	return store
}

func removeRun(t *testing.T, store *Store, runID pgtype.UUID) {
	t.Helper()
	t.Cleanup(func() {
		ctx := context.Background()
		for _, statement := range []string{
			"DELETE FROM ohfootball_raw.games WHERE scrape_run_id = $1",
			"DELETE FROM ohfootball_raw.teams WHERE scrape_run_id = $1",
			"DELETE FROM ohfootball_metadata.scrape_runs WHERE id = $1",
		} {
			if _, err := store.pool.Exec(ctx, statement, runID); err != nil {
				t.Errorf("clean up after the test: %v", err)
			}
		}
	})
}

func TestWriteTeamStoresATeamAndItsSchedule(t *testing.T) {
	store := openStore(t)
	ctx := context.Background()

	runID, err := store.StartRun(ctx, "store-test", "https://example.com")
	if err != nil {
		t.Fatalf("StartRun returned %v", err)
	}
	removeRun(t, store, runID)

	sink := store.ForRun(runID)
	team := joeeitel.Team{Season: 2025, TeamID: "store-test-1", Name: "Test Team", Division: "I"}
	rows := []joeeitel.TeamScheduleRow{
		{Season: 2025, SourceTeamID: "store-test-1", OpponentTeamID: "store-test-2", Score: "7-0"},
		{Season: 2025, SourceTeamID: "store-test-1", OpponentTeamID: "store-test-3"},
	}
	if err := sink.WriteTeam(ctx, team, rows); err != nil {
		t.Fatalf("WriteTeam returned %v", err)
	}

	var teamCount, gameCount int
	if err := store.pool.QueryRow(ctx,
		"SELECT count(*) FROM ohfootball_raw.teams WHERE scrape_run_id = $1", runID).Scan(&teamCount); err != nil {
		t.Fatalf("count teams: %v", err)
	}
	if err := store.pool.QueryRow(ctx,
		"SELECT count(*) FROM ohfootball_raw.games WHERE scrape_run_id = $1", runID).Scan(&gameCount); err != nil {
		t.Fatalf("count games: %v", err)
	}
	if teamCount != 1 || gameCount != 2 {
		t.Errorf("stored %d teams and %d games, want 1 and 2", teamCount, gameCount)
	}

	if err := store.FinishRun(ctx, runID, RunFailed, errors.New("the test ends here")); err != nil {
		t.Fatalf("FinishRun returned %v", err)
	}
}

// An opponent has no schedule of its own, so its page writes a team row alone.
func TestWriteTeamAcceptsATeamWithoutSchedule(t *testing.T) {
	store := openStore(t)
	ctx := context.Background()

	runID, err := store.StartRun(ctx, "store-test", "https://example.com")
	if err != nil {
		t.Fatalf("StartRun returned %v", err)
	}
	removeRun(t, store, runID)

	sink := store.ForRun(runID)
	team := joeeitel.Team{Season: 2025, TeamID: "store-test-4", Name: "Opponent"}
	if err := sink.WriteTeam(ctx, team, nil); err != nil {
		t.Fatalf("WriteTeam returned %v", err)
	}

	var gameCount int
	if err := store.pool.QueryRow(ctx,
		"SELECT count(*) FROM ohfootball_raw.games WHERE scrape_run_id = $1", runID).Scan(&gameCount); err != nil {
		t.Fatalf("count games: %v", err)
	}
	if gameCount != 0 {
		t.Errorf("stored %d games, want 0", gameCount)
	}

	if err := store.FinishRun(ctx, runID, RunFailed, nil); err != nil {
		t.Fatalf("FinishRun returned %v", err)
	}
}

func TestNewRejectsAnUnreadableDatabaseURL(t *testing.T) {
	if _, err := New(context.Background(), "://not a url", 4); err == nil {
		t.Fatal("New returned no error for an unreadable database URL")
	}
}
