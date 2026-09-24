// Package database opens the warehouse and runs statements against it.
//
// The API reads tables that dbt builds. Those tables are absent from the migrations, so nothing
// can type a query against them ahead of time and every statement here is written by hand.
package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Client holds the pool the API reads through.
type Client struct {
	pool *pgxpool.Pool
}

// Open connects to the warehouse and proves the connection works before it returns.
func Open(ctx context.Context, databaseURL string) (*Client, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("configure postgres: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("connect to postgres: %w", err)
	}
	return &Client{pool: pool}, nil
}

func (client *Client) Close() {
	client.pool.Close()
}

func (client *Client) Ping(ctx context.Context) error {
	return client.pool.Ping(ctx)
}

// Query runs a statement that returns rows.
func (client *Client) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	return client.pool.Query(ctx, sql, args...)
}

// QueryRow runs a statement that returns at most one row.
func (client *Client) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return client.pool.QueryRow(ctx, sql, args...)
}
