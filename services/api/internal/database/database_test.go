package database_test

import (
	"context"
	"os"
	"testing"

	"github.com/StephenODea54/services/api/internal/database"
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

// TestStatements runs the statement methods that readers of the dbt marts use. The statements
// read no table, because the test checks the connection path and not the warehouse.
func TestStatements(t *testing.T) {
	client := openClient(t)
	ctx := context.Background()

	if err := client.Ping(ctx); err != nil {
		t.Fatalf("Ping returned %v", err)
	}

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
