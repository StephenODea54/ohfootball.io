// Command server runs the API as a long lived HTTP server backed by Postgres. It is what local
// development and the compose stack use.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/StephenODea54/services/api/internal/config"
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

	homeAdvantage, err := config.Float("ELO_HOME_ADVANTAGE", 30)
	if err != nil {
		return err
	}
	ratingScale, err := config.Float("ELO_RATING_SCALE", 400)
	if err != nil {
		return err
	}
	complexityLimit, err := config.Int("GRAPHQL_COMPLEXITY_LIMIT", server.DefaultComplexityLimit)
	if err != nil {
		return err
	}

	database, err := store.Open(
		ctx,
		config.String("DATABASE_URL", defaultDatabaseURL),
		store.PredictionConfig{HomeAdvantage: homeAdvantage, RatingScale: ratingScale},
	)
	if err != nil {
		return err
	}
	defer database.Close()

	handler := server.New(database, server.Options{
		CORSOrigin:      config.String("CORS_ORIGIN", "http://localhost:3000"),
		ComplexityLimit: complexityLimit,
	})

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
