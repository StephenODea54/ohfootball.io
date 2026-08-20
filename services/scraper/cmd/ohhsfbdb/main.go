// Command ohhsfbdb reads the season records of ohhsfbdb.net and stores them in
// the raw layer of the warehouse.
//
// The command fills the seasons that joeeitel.com does not cover. It runs by
// hand, and it never runs on a schedule. The environment supplies every input.
// See the README of this service.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/StephenODea54/services/scraper/internal/config"
	"github.com/StephenODea54/services/scraper/internal/fetch"
	"github.com/StephenODea54/services/scraper/internal/ohhsfbdb"
	"github.com/StephenODea54/services/scraper/internal/store"
)

const scraperVersion = "ohhsfbdb@0.1.0"

// summary is the one line of output of one run. The field names are part of the
// contract with whatever reads the logs.
type summary struct {
	RunID            string `json:"run_id"`
	FirstSeason      int    `json:"first_season"`
	LastSeason       int    `json:"last_season"`
	IndexEntries     int    `json:"index_entries"`
	Sheets           int    `json:"sheets"`
	SheetsWithNumber int    `json:"sheets_with_number"`
	GameRows         int    `json:"game_rows"`
	SummaryRows      int    `json:"summary_rows"`
	Status           string `json:"status"`
}

func main() {
	if err := run(); err != nil {
		slog.Error("backfill failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	configuration, err := config.LoadOhhsfbdb(os.Getenv)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	database, err := store.New(ctx, configuration.DatabaseURL, configuration.Workers)
	if err != nil {
		return err
	}
	defer database.Close()

	runner := &ohhsfbdb.Runner{
		Client: fetch.New(fetch.Options{
			RequestsPerSecond: configuration.RequestsPerSecond,
			Timeout:           configuration.RequestTimeout,
			MaxRetries:        configuration.MaxRetries,
			UserAgent:         configuration.UserAgent,
			// The host answers some requests with a page that asks the browser
			// to run a script, and it sends status 200 to do so. Without this
			// the crawler would store that page as if it were a sheet.
			AcceptBody: ohhsfbdb.AcceptBody,
		}),
		Workers: configuration.Workers,
		BaseURL: configuration.BaseURL,
	}

	runID, err := database.StartRun(ctx, scraperVersion, configuration.BaseURL)
	if err != nil {
		return err
	}
	slog.Info("backfill started",
		"run_id", runID.String(),
		"first_season", ohhsfbdb.FirstSeason,
		"last_season", ohhsfbdb.LastSeason)

	result, runErr := runner.Run(ctx, database.ForOhhsfbdbRun(runID))
	status := statusFor(runErr)

	// The run row must record the outcome even after an interrupt, so this call
	// does not carry the cancelled context.
	if err := database.FinishRun(context.WithoutCancel(ctx), runID, status, runErr); err != nil {
		return errors.Join(runErr, err)
	}
	if runErr != nil {
		return runErr
	}

	printSummary(summary{
		RunID:            runID.String(),
		FirstSeason:      ohhsfbdb.FirstSeason,
		LastSeason:       ohhsfbdb.LastSeason,
		IndexEntries:     result.IndexEntries,
		Sheets:           result.Sheets,
		SheetsWithNumber: result.SheetsWithNumber,
		GameRows:         result.GameRows,
		SummaryRows:      result.SummaryRows,
		Status:           string(status),
	})
	return nil
}

func statusFor(err error) store.RunStatus {
	if err != nil {
		return store.RunFailed
	}
	return store.RunSucceeded
}

func printSummary(value summary) {
	if err := json.NewEncoder(os.Stdout).Encode(value); err != nil {
		slog.Error("print summary", "error", err)
	}
}
