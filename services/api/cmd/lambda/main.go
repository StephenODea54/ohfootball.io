// Command lambda runs the API as a function behind a function URL. It answers from a SQLite
// snapshot that ships inside the deployment package, so a request opens no connection and reaches
// no database server.
package main

import (
	"log/slog"
	"net/http"
	"os"

	"github.com/StephenODea54/services/api/internal/config"
	"github.com/StephenODea54/services/api/internal/server"
	"github.com/StephenODea54/services/api/internal/store"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/awslabs/aws-lambda-go-api-proxy/httpadapter"
)

// defaultSnapshotPath is where the runtime unpacks the deployment package. The snapshot sits beside
// the binary.
const defaultSnapshotPath = "/var/task/ohfootball.db"

func main() {
	handler, err := newHandler(config.String("SNAPSHOT_PATH", defaultSnapshotPath))
	if err != nil {
		slog.Error("start up failed", "error", err)
		os.Exit(1)
	}
	// A function URL sends the version two payload.
	lambda.Start(httpadapter.NewV2(handler).ProxyWithContext)
}

// newHandler opens the snapshot and builds the HTTP handler once. The runtime keeps the process
// alive between requests, so later requests reuse both.
func newHandler(snapshotPath string) (http.Handler, error) {
	homeAdvantage, err := config.Float("ELO_HOME_ADVANTAGE", 30)
	if err != nil {
		return nil, err
	}
	ratingScale, err := config.Float("ELO_RATING_SCALE", 400)
	if err != nil {
		return nil, err
	}
	complexityLimit, err := config.Int("GRAPHQL_COMPLEXITY_LIMIT", server.DefaultComplexityLimit)
	if err != nil {
		return nil, err
	}

	// The snapshot is never closed. The runtime ends the process itself, and holding the file open
	// is what lets a later request skip opening it again.
	snapshot, err := store.OpenSQLite(
		snapshotPath,
		store.PredictionConfig{HomeAdvantage: homeAdvantage, RatingScale: ratingScale},
	)
	if err != nil {
		return nil, err
	}

	return server.New(snapshot, server.Options{
		CORSOrigin:      config.String("CORS_ORIGIN", "https://ohfootball.io"),
		ComplexityLimit: complexityLimit,
	}), nil
}
