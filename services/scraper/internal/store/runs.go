package store

import (
	"context"
	"fmt"

	"github.com/StephenODea54/pkg/database/db"
	"github.com/jackc/pgx/v5/pgtype"
)

// RunStatus is the final state of one scrape run.
//
// A run also has a third state, running, which StartRun writes. Go needs no
// constant for it, because only the SQL sets it.
type RunStatus string

const (
	RunSucceeded RunStatus = "succeeded"
	RunFailed    RunStatus = "failed"
)

// StartRun records the start of one run and returns its identifier. Every row
// that the run writes carries that identifier.
func (s *Store) StartRun(ctx context.Context, scraperVersion, rootURL string) (pgtype.UUID, error) {
	runID, err := db.New(s.pool).StartScrapeRun(ctx, db.StartScrapeRunParams{
		ScraperVersion: scraperVersion,
		RootUrl:        rootURL,
	})
	if err != nil {
		return pgtype.UUID{}, fmt.Errorf("start scrape run: %w", err)
	}
	return runID, nil
}

// FinishRun records the end of one run. A failed run keeps the rows it already
// wrote, and the status tells a reader not to trust them.
func (s *Store) FinishRun(ctx context.Context, runID pgtype.UUID, status RunStatus, runErr error) error {
	message := pgtype.Text{}
	if runErr != nil {
		message = nullableText(runErr.Error())
	}

	err := db.New(s.pool).FinishScrapeRun(ctx, db.FinishScrapeRunParams{
		ID:           runID,
		Status:       string(status),
		ErrorMessage: message,
	})
	if err != nil {
		return fmt.Errorf("finish scrape run: %w", err)
	}
	return nil
}

// ForRun binds a sink to one run, so the caller does not carry the run
// identifier through every stage.
func (s *Store) ForRun(runID pgtype.UUID) *RunSink {
	return &RunSink{store: s, runID: runID}
}
