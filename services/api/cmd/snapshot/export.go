package main

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

// table describes one table of the snapshot and the query that fills it.
//
// Every date is cast to text in the query, because the snapshot stores dates in YYYY-MM-DD form and
// that is what Postgres returns for a date cast to text. Every key is cast to text, because the
// snapshot stores a key as text. Every flag is cast to a whole number, because the snapshot stores
// a flag as 0 or 1. The casts keep the copy free of type conversion, so a column is read and
// written as it stands.
//
// The order of columns has to match the order the query selects.
type table struct {
	name    string
	columns []string
	query   string
}

var tables = []table{
	{
		name: "dim_teams",
		columns: []string{
			"team_key", "source_id", "season", "state_code", "name", "mascot", "city",
			"division", "region", "primary_color_hex", "secondary_color_hex",
		},
		query: `
			SELECT
				team_key::text,
				source_id,
				season,
				state_code,
				name,
				mascot,
				city,
				division,
				region,
				primary_color_hex,
				secondary_color_hex
			FROM ohfootball_marts.dim_teams
			WHERE is_current
		`,
	},
	{
		name:    "dim_dates",
		columns: []string{"date_key", "date_day"},
		query: `
			SELECT date_key, date_day::text
			FROM ohfootball_marts.dim_dates
		`,
	},
	{
		name: "fct_games",
		columns: []string{
			"game_key", "season", "game_date_key", "team_a_key", "team_b_key",
			"is_team_a_home", "is_team_b_home", "team_a_result", "team_b_result",
			"team_a_score", "team_b_score", "is_playoff_game", "notes",
		},
		query: `
			SELECT
				game_key::text,
				season,
				game_date_key,
				team_a_key::text,
				team_b_key::text,
				is_team_a_home::int,
				is_team_b_home::int,
				team_a_result,
				team_b_result,
				team_a_score,
				team_b_score,
				is_playoff_game::int,
				notes
			FROM ohfootball_marts.fct_games
			WHERE is_current
		`,
	},
	{
		name:    "fct_team_elo_ratings",
		columns: []string{"team_key", "season", "elo_rating", "as_of_date"},
		query: `
			SELECT team_key::text, season, elo_rating, as_of_date::text
			FROM ohfootball_marts.fct_team_elo_ratings
		`,
	},
	{
		name: "fct_game_predictions",
		columns: []string{
			"game_key", "game_date", "team_a_rating", "team_b_rating", "team_a_win_probability",
		},
		query: `
			SELECT
				game_key::text,
				game_date::text,
				team_a_rating,
				team_b_rating,
				team_a_win_probability
			FROM ohfootball_marts.fct_game_predictions
		`,
	},
}

// insertStatement returns the statement that writes one row of the table.
func (source table) insertStatement() string {
	placeholders := strings.TrimSuffix(strings.Repeat("?, ", len(source.columns)), ", ")
	return fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s)",
		source.name,
		strings.Join(source.columns, ", "),
		placeholders,
	)
}

// copyTable reads every row the query returns and writes it to the snapshot. The whole table is
// written in one transaction, so a failure part way through leaves no partial table behind.
func copyTable(ctx context.Context, warehouse *pgx.Conn, snapshot *sql.DB, source table) (int64, error) {
	rows, err := warehouse.Query(ctx, source.query)
	if err != nil {
		return 0, fmt.Errorf("read %s: %w", source.name, err)
	}
	defer rows.Close()

	transaction, err := snapshot.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("start the %s transaction: %w", source.name, err)
	}
	defer transaction.Rollback()

	statement, err := transaction.PrepareContext(ctx, source.insertStatement())
	if err != nil {
		return 0, fmt.Errorf("prepare the %s insert: %w", source.name, err)
	}
	defer statement.Close()

	var written int64
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return 0, fmt.Errorf("read a %s row: %w", source.name, err)
		}
		if _, err := statement.ExecContext(ctx, values...); err != nil {
			return 0, fmt.Errorf("write a %s row: %w", source.name, err)
		}
		written++
	}
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("read %s: %w", source.name, err)
	}
	if err := transaction.Commit(); err != nil {
		return 0, fmt.Errorf("commit %s: %w", source.name, err)
	}
	return written, nil
}
