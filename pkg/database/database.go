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
