// Command joe-eitel reads high school football results from joeeitel.com and
// stores them in the raw layer of the warehouse.
//
// The environment supplies every input. See the README of this service.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"slices"
	"syscall"

	"github.com/StephenODea54/services/scraper/internal/config"
	"github.com/StephenODea54/services/scraper/internal/fetch"
	"github.com/StephenODea54/services/scraper/internal/pipeline"
	"github.com/StephenODea54/services/scraper/internal/store"
)

const scraperVersion = "joe-eitel@0.1.0"

// summary is one line of output for one season. The field names are part of
// the contract with whatever reads the logs.
type summary struct {
	RunID                   string `json:"run_id,omitempty"`
	Season                  int    `json:"season"`
	Regions                 int    `json:"regions"`
	OHSAATeams              int    `json:"ohsaa_teams"`
	OpponentTeamsDiscovered int    `json:"opponent_teams_discovered"`
	OpponentTeamsScraped    int    `json:"opponent_teams_scraped"`
	GameRows                int    `json:"game_rows"`
	Status                  string `json:"status"`
}

// statusSkipped names a season that the site does not list yet. It never
// reaches the database, because such a run creates no row.
const statusSkipped = "skipped"

func main() {
	if err := run(); err != nil {
		slog.Error("scrape failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	configuration, err := config.Load(os.Getenv)
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

	runner := &pipeline.Runner{
		Client: fetch.New(fetch.Options{
			RequestsPerSecond: configuration.RequestsPerSecond,
			Timeout:           configuration.RequestTimeout,
			MaxRetries:        configuration.MaxRetries,
			UserAgent:         configuration.UserAgent,
			Accept:            "text/html,application/xhtml+xml",
		}),
		Workers: configuration.Workers,
		BaseURL: configuration.BaseURL,
	}

	listed, err := runner.ListSeasons(ctx)
	if err != nil {
		return err
	}

	seasons, skipped := targetSeasons(configuration, listed)
	if skipped {
		slog.Info("the site does not list this season yet", "season", configuration.Season)
		printSummary(summary{Season: configuration.Season, Status: statusSkipped})
		return nil
	}

	var failures []error
	for _, season := range seasons {
		if err := scrapeSeason(ctx, database, runner, season); err != nil {
			failures = append(failures, fmt.Errorf("season %d: %w", season, err))
		}
		// A failed season does not stop the other seasons, but an interrupt
		// does.
		if ctx.Err() != nil {
			break
		}
	}
	return errors.Join(failures...)
}

// targetSeasons applies the season selection rule to the seasons that the site
// lists. skipped is true when the run names one season that the site does not
// list yet. The daily job supplies the year of the season, and the site
// publishes that year some time before the season starts.
func targetSeasons(configuration config.Config, listed []int) (seasons []int, skipped bool) {
	if configuration.AllSeasons {
		return listed, false
	}
	if slices.Contains(listed, configuration.Season) {
		return []int{configuration.Season}, false
	}
	return nil, true
}

// statusFor decides the status of one run. This is the only place that decides
// it.
func statusFor(err error) store.RunStatus {
	if err != nil {
		return store.RunFailed
	}
	return store.RunSucceeded
}

// scrapeSeason reads one season under one run row.
func scrapeSeason(ctx context.Context, database *store.Store, runner *pipeline.Runner, season int) error {
	runID, err := database.StartRun(ctx, scraperVersion, runner.BaseURL)
	if err != nil {
		return err
	}
	slog.Info("season started", "run_id", runID.String(), "season", season)

	result, seasonErr := runner.Season(ctx, season, database.ForRun(runID))
	status := statusFor(seasonErr)

	// The run row must record the outcome even after an interrupt, so this
	// call does not carry the cancelled context.
	if err := database.FinishRun(context.WithoutCancel(ctx), runID, status, seasonErr); err != nil {
		return errors.Join(seasonErr, err)
	}
	if seasonErr != nil {
		return seasonErr
	}

	printSummary(summary{
		RunID:                   runID.String(),
		Season:                  result.Season,
		Regions:                 result.Regions,
		OHSAATeams:              result.OHSAATeams,
		OpponentTeamsDiscovered: result.OpponentsDiscovered,
		OpponentTeamsScraped:    result.OpponentsScraped,
		GameRows:                result.GameRows,
		Status:                  string(status),
	})
	return nil
}

func printSummary(value summary) {
	if err := json.NewEncoder(os.Stdout).Encode(value); err != nil {
		slog.Error("print summary", "error", err)
	}
}
