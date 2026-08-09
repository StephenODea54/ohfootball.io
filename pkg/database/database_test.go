package database_test

import (
	"context"
	"os"
	"testing"

	"github.com/StephenODea54/pkg/database"
	"github.com/StephenODea54/pkg/database/db"
	"github.com/jackc/pgx/v5/pgtype"
)

// TestScrapeQueries runs every query of one scrape run against the development
// database. The whole test runs in one transaction, which it rolls back, so it
// leaves no rows for the analytics models to read.
func TestScrapeQueries(t *testing.T) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL is not set")
	}

	ctx := context.Background()
	client, err := database.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	transaction, err := client.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer transaction.Rollback(ctx)
	queries := client.WithTx(transaction)

	runID, err := queries.StartScrapeRun(ctx, db.StartScrapeRunParams{
		ScraperVersion: "integration-test",
		RootUrl:        "https://example.com",
	})
	if err != nil {
		t.Fatal(err)
	}

	if err := queries.InsertTeam(ctx, db.InsertTeamParams{
		ScrapeRunID: runID,
		Season:      2025,
		TeamID:      "test-team",
		Name:        pgtype.Text{String: "Test Team", Valid: true},
	}); err != nil {
		t.Fatal(err)
	}

	gameCount, err := queries.InsertGames(ctx, []db.InsertGamesParams{{
		ScrapeRunID:    runID,
		Season:         2025,
		SourceTeamID:   pgtype.Text{String: "test-team", Valid: true},
		OpponentTeamID: pgtype.Text{String: "test-opponent", Valid: true},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if gameCount != 1 {
		t.Fatalf("inserted %d games, want 1", gameCount)
	}

	if err := queries.FinishScrapeRun(ctx, db.FinishScrapeRunParams{
		ID:     runID,
		Status: "succeeded",
	}); err != nil {
		t.Fatal(err)
	}

	var teamCount int
	row := transaction.QueryRow(ctx,
		"SELECT count(*) FROM ohfootball_raw.teams WHERE scrape_run_id = $1", runID)
	if err := row.Scan(&teamCount); err != nil {
		t.Fatal(err)
	}
	if teamCount != 1 {
		t.Fatalf("stored %d teams, want 1", teamCount)
	}
}
