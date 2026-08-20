package database_test

import (
	"context"
	"os"
	"testing"

	"github.com/StephenODea54/pkg/database"
	"github.com/StephenODea54/pkg/database/db"
	"github.com/jackc/pgx/v5/pgtype"
)

// openClient connects to the development database, or skips the test when no
// DATABASE_URL is set.
func openClient(t *testing.T) *database.Client {
	t.Helper()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL is not set")
	}

	client, err := database.Open(context.Background(), databaseURL)
	if err != nil {
		t.Fatalf("Open returned %v", err)
	}
	t.Cleanup(client.Close)
	return client
}

// TestScrapeQueries runs the queries of one scrape run against the development
// database. The whole test runs in one transaction, which it rolls back, so it
// leaves no rows for the analytics models to read.
func TestScrapeQueries(t *testing.T) {
	client := openClient(t)
	ctx := context.Background()

	if err := client.Ping(ctx); err != nil {
		t.Fatalf("Ping returned %v", err)
	}

	transaction, err := client.Begin(ctx)
	if err != nil {
		t.Fatalf("Begin returned %v", err)
	}
	defer transaction.Rollback(ctx)
	queries := client.WithTx(transaction)

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

// TestHandWrittenStatements runs the statement methods that readers of the dbt
// marts use. The statements read no table, because the test checks the
// connection path and not the warehouse.
func TestHandWrittenStatements(t *testing.T) {
	client := openClient(t)
	ctx := context.Background()

	var one int
	if err := client.QueryRow(ctx, "SELECT $1::int", 1).Scan(&one); err != nil {
		t.Fatalf("QueryRow returned %v", err)
	}
	if one != 1 {
		t.Fatalf("read %d, want 1", one)
	}

	rows, err := client.Query(ctx, "SELECT value FROM generate_series(1, $1) AS value", 3)
	if err != nil {
		t.Fatalf("Query returned %v", err)
	}
	defer rows.Close()

	total := 0
	for rows.Next() {
		var value int
		if err := rows.Scan(&value); err != nil {
			t.Fatalf("Scan returned %v", err)
		}
		total += value
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("Err returned %v", err)
	}
	if total != 6 {
		t.Fatalf("summed %d, want 6", total)
	}
}
