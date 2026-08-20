package database

import (
	"context"
	"fmt"

	"github.com/StephenODea54/pkg/database/db"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Client struct {
	*db.Queries
	pool *pgxpool.Pool
}

func Open(ctx context.Context, databaseURL string) (*Client, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("configure postgres: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("connect to postgres: %w", err)
	}
	return &Client{Queries: db.New(pool), pool: pool}, nil
}

func (client *Client) Close() {
	client.pool.Close()
}

func (client *Client) Begin(ctx context.Context) (pgx.Tx, error) {
	return client.pool.Begin(ctx)
}

func (client *Client) Ping(ctx context.Context) error {
	return client.pool.Ping(ctx)
}

// Query runs a statement that sqlc did not generate. The read side of the warehouse is built by
// dbt, so its tables are absent from the migrations that sqlc reads and it cannot type a query
// against them.
func (client *Client) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	return client.pool.Query(ctx, sql, args...)
}

// QueryRow runs a statement that returns at most one row. See [Client.Query].
func (client *Client) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return client.pool.QueryRow(ctx, sql, args...)
}
