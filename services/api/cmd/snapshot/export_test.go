package main

import (
	"database/sql"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/StephenODea54/services/api/internal/store"
	_ "modernc.org/sqlite"
)

// emptySnapshot builds a snapshot that holds the schema and no rows.
func emptySnapshot(t *testing.T) *sql.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "snapshot.db")
	snapshot, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("create snapshot: %v", err)
	}
	t.Cleanup(func() { snapshot.Close() })
	if _, err := snapshot.Exec(store.SQLiteSchema); err != nil {
		t.Fatalf("apply schema: %v", err)
	}
	return snapshot
}

func schemaColumns(t *testing.T, snapshot *sql.DB, table string) []string {
	t.Helper()
	rows, err := snapshot.Query(`SELECT name FROM pragma_table_info(?)`, table)
	if err != nil {
		t.Fatalf("read the columns of %s: %v", table, err)
	}
	defer rows.Close()

	columns := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatalf("scan a column of %s: %v", table, err)
		}
		columns = append(columns, name)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("read the columns of %s: %v", table, err)
	}
	return columns
}

func schemaTables(t *testing.T, snapshot *sql.DB) []string {
	t.Helper()
	rows, err := snapshot.Query(`
		SELECT name FROM sqlite_master
		WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
	`)
	if err != nil {
		t.Fatalf("read the tables: %v", err)
	}
	defer rows.Close()

	names := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatalf("scan a table name: %v", err)
		}
		names = append(names, name)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("read the tables: %v", err)
	}
	return names
}

// A column added to the schema and forgotten in the export would leave that column null in every
// row of a deployed snapshot, and no query would report it. This compares the two lists instead.
func TestEveryExportedTableFillsEverySchemaColumn(t *testing.T) {
	snapshot := emptySnapshot(t)

	for _, source := range tables {
		wanted := schemaColumns(t, snapshot, source.name)
		if len(wanted) == 0 {
			t.Fatalf("%s is exported but the schema holds no such table", source.name)
		}
		got := append([]string{}, source.columns...)
		sort.Strings(got)
		sort.Strings(wanted)
		if strings.Join(got, ",") != strings.Join(wanted, ",") {
			t.Fatalf("%s exports %v, but the schema holds %v", source.name, got, wanted)
		}
	}
}

// A table added to the schema and forgotten in the export would stay empty in a deployed snapshot.
func TestEverySchemaTableIsExported(t *testing.T) {
	exported := map[string]bool{}
	for _, source := range tables {
		exported[source.name] = true
	}
	for _, name := range schemaTables(t, emptySnapshot(t)) {
		if !exported[name] {
			t.Fatalf("the schema holds %s, but nothing exports it", name)
		}
	}
}

// The statement is built from the column list, so running it against the real schema proves that
// every name is spelled the way the schema spells it.
func TestEveryInsertStatementRunsAgainstTheSchema(t *testing.T) {
	snapshot := emptySnapshot(t)

	for _, source := range tables {
		values := make([]any, len(source.columns))
		for index := range values {
			values[index] = 1
		}
		if _, err := snapshot.Exec(source.insertStatement(), values...); err != nil {
			t.Fatalf("the %s insert failed: %v", source.name, err)
		}
	}
}

func TestInsertStatementHoldsOnePlaceholderPerColumn(t *testing.T) {
	source := table{name: "dim_dates", columns: []string{"date_key", "date_day"}}
	want := "INSERT INTO dim_dates (date_key, date_day) VALUES (?, ?)"
	if got := source.insertStatement(); got != want {
		t.Fatalf("insertStatement = %q, want %q", got, want)
	}
	for _, source := range tables {
		statement := source.insertStatement()
		if count := strings.Count(statement, "?"); count != len(source.columns) {
			t.Fatalf("%s holds %d placeholders for %d columns", source.name, count, len(source.columns))
		}
	}
}

// The queries carry the casts that keep the copy free of type conversion. A key or a date that
// arrives without one would reach the snapshot in a form no query reads.
func TestEveryQuerySelectsTheColumnsItDeclares(t *testing.T) {
	for _, source := range tables {
		if strings.Count(source.query, ",")+1 < len(source.columns) {
			t.Fatalf("the %s query selects fewer columns than it declares", source.name)
		}
		for _, column := range []string{"team_key", "game_key"} {
			if strings.Contains(source.query, column) && !strings.Contains(source.query, column+"::text") {
				t.Fatalf("the %s query reads %s without casting it to text", source.name, column)
			}
		}
	}
}
