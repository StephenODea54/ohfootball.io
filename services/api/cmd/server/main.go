// Command server runs the API as a long lived HTTP server backed by Postgres. It is what local
// development and the compose stack use.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/StephenODea54/services/api/internal/config"
	"github.com/StephenODea54/services/api/internal/guard"
	"github.com/StephenODea54/services/api/internal/ratelimit"
	"github.com/StephenODea54/services/api/internal/server"
	"github.com/StephenODea54/services/api/internal/store"
)

const defaultDatabaseURL = "postgres://im_batman:shhhhhhhhh@localhost:5432/ohfootball?sslmode=disable"

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	complexityLimit, err := config.Int("GRAPHQL_COMPLEXITY_LIMIT", server.DefaultComplexityLimit)
	if err != nil {
		return err
	}
	fieldLimit, err := readFieldLimit()
	if err != nil {
		return err
	}
	limits, err := readLimits()
	if err != nil {
		return err
	}
	// The key is checked before the database is opened, so a bad key stops the start at once.
	siteBuildKey := config.String("SITE_BUILD_KEY", "")
	if err := guard.CheckBuildKey(siteBuildKey); err != nil {
		return fmt.Errorf("SITE_BUILD_KEY: %w", err)
	}

	database, err := store.Open(ctx, config.String("DATABASE_URL", defaultDatabaseURL))
	if err != nil {
		return err
	}
	defer database.Close()

	handler, err := server.New(database, server.Options{
		ComplexityLimit: complexityLimit,
		FieldLimit:      fieldLimit,
		Limits:          limits,
		SiteBuildKey:    siteBuildKey,
	})
	if err != nil {
		return err
	}

	httpServer := &http.Server{
		Addr:              config.String("HTTP_ADDR", ":8082"),
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errChannel := make(chan error, 1)
	go func() {
		slog.Info("GraphQL server listening", "address", httpServer.Addr)
		errChannel <- httpServer.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		shutdownContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return httpServer.Shutdown(shutdownContext)
	case err := <-errChannel:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

// readFieldLimit reads the most fields that one operation may select. It must be a whole number of
// at least 1.
func readFieldLimit() (int, error) {
	limit, err := config.Int("GRAPHQL_FIELD_LIMIT", server.DefaultFieldLimit)
	if err != nil {
		return 0, err
	}
	if limit < 1 {
		return 0, errors.New("GRAPHQL_FIELD_LIMIT must be at least 1")
	}
	return limit, nil
}

// readLimits reads the rate limits. A limit that is not a whole number more than zero is an
// error, and so is a burst of one address that is larger than the total burst.
func readLimits() (ratelimit.Limits, error) {
	defaults := ratelimit.DefaultLimits()
	settings := []struct {
		name     string
		fallback int
		value    int
	}{
		{name: "RATE_LIMIT_ADDRESS_PER_MINUTE", fallback: int(defaults.PerAddress.PerSecond * 60)},
		{name: "RATE_LIMIT_ADDRESS_BURST", fallback: defaults.PerAddress.Burst},
		{name: "RATE_LIMIT_TOTAL_PER_SECOND", fallback: int(defaults.Total.PerSecond)},
		{name: "RATE_LIMIT_TOTAL_BURST", fallback: defaults.Total.Burst},
	}
	for index := range settings {
		value, err := config.Int(settings[index].name, settings[index].fallback)
		if err != nil {
			return ratelimit.Limits{}, err
		}
		if value < 1 {
			return ratelimit.Limits{}, fmt.Errorf("%s must be at least 1", settings[index].name)
		}
		settings[index].value = value
	}
	// With a larger burst, one address could empty the total bucket and lock out every caller
	// until it fills again.
	if settings[1].value > settings[3].value {
		return ratelimit.Limits{}, fmt.Errorf(
			"RATE_LIMIT_ADDRESS_BURST (%d) must not be larger than RATE_LIMIT_TOTAL_BURST (%d)",
			settings[1].value, settings[3].value,
		)
	}
	return ratelimit.Limits{
		PerAddress: ratelimit.Rate{PerSecond: float64(settings[0].value) / 60, Burst: settings[1].value},
		Total:      ratelimit.Rate{PerSecond: float64(settings[2].value), Burst: settings[3].value},
	}, nil
}
