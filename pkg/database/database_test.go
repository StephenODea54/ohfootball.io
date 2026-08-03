package database_test

import (
	"context"
	"os"
	"testing"

	"github.com/StephenODea54/pkg/database"
	"github.com/StephenODea54/pkg/database/db"
	"github.com/jackc/pgx/v5/pgtype"
)

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

	teamCount, err := queries.AppendTeams(ctx, []db.AppendTeamsParams{{
		ScrapeRunID: runID,
		Season:      2025,
		TeamID:      "test-team",
		Name:        pgtype.Text{String: "Test Team", Valid: true},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if teamCount != 1 {
		t.Fatalf("appended %d teams, want 1", teamCount)
	}

	gameCount, err := queries.AppendGames(ctx, []db.AppendGamesParams{{
		ScrapeRunID:    runID,
		Season:         2025,
		SourceTeamID:   pgtype.Text{String: "test-team", Valid: true},
		OpponentTeamID: pgtype.Text{String: "test-opponent", Valid: true},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if gameCount != 1 {
		t.Fatalf("appended %d games, want 1", gameCount)
	}

	if err := queries.FinishScrapeRun(ctx, db.FinishScrapeRunParams{
		ID:     runID,
		Status: "succeeded",
	}); err != nil {
		t.Fatal(err)
	}
}
