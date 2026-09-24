package store

import (
	"context"
	"fmt"

	"github.com/StephenODea54/services/scraper/internal/db"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store writes the result of a scrape run. Its methods are safe for concurrent
// use, because each one takes a connection from the pool.
type Store struct {
	pool *pgxpool.Pool
}

// New opens the connection pool.
//
// The pool must hold at least one connection for each worker. Every worker
// writes one team page in its own transaction, so a smaller pool makes some
// workers wait for a connection at every page. The default pool size is the
// larger of four and the processor count, which is below the worker count on a
// small container.
func New(ctx context.Context, databaseURL string, workers int) (*Store, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("read the database URL: %w", err)
	}
	if config.MaxConns < int32(workers) {
		config.MaxConns = int32(workers)
	}

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("configure postgres: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("connect to postgres: %w", err)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() {
	s.pool.Close()
}

// withTx runs fn inside one transaction. The transaction rolls back unless fn
// returns nil.
func (s *Store) withTx(ctx context.Context, fn func(*db.Queries) error) error {
	transaction, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer transaction.Rollback(ctx)

	if err := fn(db.New(transaction)); err != nil {
		return err
	}
	return transaction.Commit(ctx)
}

// nullableText maps an empty string to a null column. The site leaves many
// fields blank, and a blank field is not a value.
func nullableText(value string) pgtype.Text {
	return pgtype.Text{String: value, Valid: value != ""}
}
