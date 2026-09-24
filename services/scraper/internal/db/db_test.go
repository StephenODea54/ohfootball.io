package db_test

import (
	"context"
	"os"
	"testing"

	"github.com/StephenODea54/services/scraper/internal/db"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// openPool connects to the development database, or skips the test when no DATABASE_URL is set.
func openPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL is not set")
	}

	pool, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		t.Fatalf("New returned %v", err)
	}
	t.Cleanup(pool.Close)
	if err := pool.Ping(context.Background()); err != nil {
		t.Fatalf("Ping returned %v", err)
	}
	return pool
}

// TestScrapeQueries runs the queries of one scrape run against the development database. The
// whole test runs in one transaction, which it rolls back, so it leaves no rows for the analytics
// models to read.
func TestScrapeQueries(t *testing.T) {
	pool := openPool(t)
	ctx := context.Background()

	transaction, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("Begin returned %v", err)
	}
	defer transaction.Rollback(ctx)
	queries := db.New(transaction)

	runID, err := queries.StartScrapeRun(ctx, db.StartScrapeRunParams{
		ScraperVersion: "integration-test",
		RootUrl:        "https://example.com",
	})
	if err != nil {
		t.Fatalf("StartScrapeRun returned %v", err)
	}

	if err := queries.InsertTeam(ctx, db.InsertTeamParams{
		ScrapeRunID: runID,
		Season:      2025,
		TeamID:      "test-team",
		Name:        pgtype.Text{String: "Test Team", Valid: true},
	}); err != nil {
		t.Fatalf("InsertTeam returned %v", err)
	}

	gameCount, err := queries.InsertGames(ctx, []db.InsertGamesParams{{
		ScrapeRunID:    runID,
		Season:         2025,
		SourceTeamID:   pgtype.Text{String: "test-team", Valid: true},
		OpponentTeamID: pgtype.Text{String: "test-opponent", Valid: true},
	}})
	if err != nil {
		t.Fatalf("InsertGames returned %v", err)
	}
	if gameCount != 1 {
		t.Fatalf("inserted %d games, want 1", gameCount)
	}

	if err := queries.FinishScrapeRun(ctx, db.FinishScrapeRunParams{
		ID:     runID,
		Status: "succeeded",
	}); err != nil {
		t.Fatalf("FinishScrapeRun returned %v", err)
	}

	var teamCount int
	row := transaction.QueryRow(ctx,
		"SELECT count(*) FROM ohfootball_raw.teams WHERE scrape_run_id = $1", runID)
	if err := row.Scan(&teamCount); err != nil {
		t.Fatalf("count the stored teams: %v", err)
	}
	if teamCount != 1 {
		t.Fatalf("stored %d teams, want 1", teamCount)
	}
}
