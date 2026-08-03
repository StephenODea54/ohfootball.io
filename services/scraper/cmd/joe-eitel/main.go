package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/StephenODea54/services/scraper/internal/joeeitel"
	"github.com/StephenODea54/services/scraper/internal/store"
)

const scraperVersion = "joe-eitel@0.1.0"

type summary struct {
	RunID                   string `json:"run_id,omitempty"`
	Season                  int    `json:"season"`
	Regions                 int    `json:"regions"`
	OHSAATeams              int    `json:"ohsaa_teams"`
	OpponentTeamsDiscovered int    `json:"opponent_teams_discovered"`
	OpponentTeamsScraped    int    `json:"opponent_teams_scraped"`
	GameRows                int    `json:"game_rows"`
	Errors                  int    `json:"errors"`
	Status                  string `json:"status"`
}

func main() {
	if err := run(); err != nil {
		slog.Error("scrape failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	config := joeeitel.DefaultConfig()
	if userAgent := os.Getenv("SCRAPER_USER_AGENT"); userAgent != "" {
		config.UserAgent = userAgent
	}

	flag.IntVar(&config.Season, "season", 0, "season to scrape; 0 discovers the latest available season")
	flag.IntVar(&config.Workers, "workers", config.Workers, "maximum concurrent HTTP workers")
	flag.Float64Var(&config.RequestsPerSecond, "rate", config.RequestsPerSecond, "maximum requests per second across all workers")
	flag.DurationVar(&config.RequestTimeout, "timeout", config.RequestTimeout, "timeout for one HTTP request")
	flag.IntVar(&config.MaxRetries, "retries", config.MaxRetries, "retries for temporary HTTP failures")
	flag.StringVar(&config.BaseURL, "base-url", config.BaseURL, "Joe Eitel site base URL")
	flag.StringVar(&config.UserAgent, "user-agent", config.UserAgent, "HTTP user agent")
	flag.Parse()

	scraper, err := joeeitel.New(config)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	database, err := store.Open(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer database.Close()

	runID, err := database.StartRun(ctx, scraperVersion, config.BaseURL)
	if err != nil {
		return err
	}
	slog.Info("scrape started", "run_id", runID.String(), "requested_season", config.Season)

	result, scrapeErr := scraper.Scrape(ctx)
	if scrapeErr != nil {
		finishErr := database.FinishRun(context.WithoutCancel(ctx), runID, "failed", scrapeErr)
		return errors.Join(scrapeErr, finishErr)
	}
	if err := database.Append(ctx, runID, result.Teams(), result.Games); err != nil {
		finishErr := database.FinishRun(context.WithoutCancel(ctx), runID, "failed", err)
		return errors.Join(err, finishErr)
	}

	status := "succeeded"
	if len(result.Errors) > 0 {
		status = "failed"
	}
	pageErr := reportPageErrors(result.Errors)
	if err := database.FinishRun(context.WithoutCancel(ctx), runID, status, pageErr); err != nil {
		return err
	}
	printSummary(runID.String(), result, status)
	return pageErr
}

func reportPageErrors(errs []error) error {
	if len(errs) == 0 {
		return nil
	}
	for index, err := range errs {
		if index == 10 {
			slog.Warn("additional scrape errors omitted from logs", "count", len(errs)-index)
			break
		}
		slog.Warn("page scrape failed", "error", err)
	}
	return fmt.Errorf("scrape completed with %d page errors", len(errs))
}

func printSummary(runID string, result joeeitel.Result, status string) {
	value := summary{
		RunID:                   runID,
		Season:                  result.Season,
		Regions:                 result.RegionCount,
		OHSAATeams:              len(result.OHSAATeams),
		OpponentTeamsDiscovered: result.DiscoveredOpponents,
		OpponentTeamsScraped:    len(result.OpponentTeams),
		GameRows:                len(result.Games),
		Errors:                  len(result.Errors),
		Status:                  status,
	}
	if err := json.NewEncoder(os.Stdout).Encode(value); err != nil {
		slog.Error("print summary", "error", err)
	}
}
