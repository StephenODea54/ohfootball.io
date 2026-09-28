// Package server builds the HTTP surface of the API. Every entry point shares this package, so a
// request is handled the same way whether the binary runs as a long lived server or as a function.
package server

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/99designs/gqlgen/graphql/errcode"
	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/lru"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/99designs/gqlgen/graphql/playground"
	"github.com/StephenODea54/services/api/graph"
	"github.com/StephenODea54/services/api/internal/guard"
	"github.com/StephenODea54/services/api/internal/ratelimit"
	"github.com/vektah/gqlparser/v2/ast"
)

// complexityLimitCode is the code gqlgen puts on an operation it refuses for being too costly. The
// library does not export the constant and does not classify the code, so a refused operation
// answers 200 by default. Registering it as a protocol error answers 422 instead, which keeps a
// refusal out of the success counts in access logs. TestComplexityLimitRejectsARepeatedQuery fails
// if a later version of gqlgen changes the code.
const complexityLimitCode = "COMPLEXITY_LIMIT_EXCEEDED"

func init() {
	errcode.RegisterErrorType(complexityLimitCode, errcode.KindProtocol)
}

const (
	// DefaultComplexityLimit is high enough for the introspection query that the playground sends
	// on load, and low enough to stop a query that repeats fields under many aliases.
	DefaultComplexityLimit = 1000

	queryCacheSize     = 1000
	persistedQuerySize = 100
)

// Store is everything the HTTP layer needs: the data the schema reads, and a readiness check.
type Store interface {
	graph.FootballStore
	Ping(context.Context) error
}

// playgroundHeaders fill the Headers pane of the playground. A browser does not let a page set
// User-Agent, so the playground names the caller in the From header. The value holds no contact,
// so the first request fails with the message that tells the caller what to write there.
var playgroundHeaders = map[string]string{"From": "your email address or the URL of your site"}

// Options collects the settings that differ between deployments.
type Options struct {
	// ComplexityLimit caps the cost of one operation. A value of zero or less selects
	// DefaultComplexityLimit.
	ComplexityLimit int
	// Limits are the rate limits. The zero value selects ratelimit.DefaultLimits.
	Limits ratelimit.Limits
	// SiteBuildKey lets the build of the site skip the contact rule and the rate limits. An
	// empty key lets no request skip them.
	SiteBuildKey string
	// Logger receives a line for each request that the guard counts. Nil selects slog.Default.
	Logger *slog.Logger
	// now reads the time. Nil selects time.Now. Only the tests of this package set it.
	now func() time.Time
}

// New returns the complete handler for the API: the GraphQL endpoint, the playground, and the
// health endpoints. It fails when a setting of the guard is not valid.
//
// The health endpoints skip the guard, because the health checks of Docker and the host send no
// contact. The playground page counts toward the rate limits but needs no contact, because a
// browser that opens it cannot set one. The GraphQL endpoint needs both.
func New(store Store, options Options) (http.Handler, error) {
	limits := options.Limits
	if limits == (ratelimit.Limits{}) {
		limits = ratelimit.DefaultLimits()
	}
	rules, err := guard.New(guard.Config{
		Limits:   limits,
		BuildKey: options.SiteBuildKey,
		Logger:   options.Logger,
		Now:      options.now,
	})
	if err != nil {
		return nil, err
	}

	limit := options.ComplexityLimit
	if limit <= 0 {
		limit = DefaultComplexityLimit
	}

	graphql := handler.New(graph.NewExecutableSchema(graph.Config{
		Resolvers: &graph.Resolver{Store: store},
	}))
	// The websocket and multipart transports are left out. The schema has no subscriptions and
	// accepts no uploads, and a function that returns one buffered response cannot hold a
	// websocket open.
	graphql.AddTransport(transport.Options{})
	graphql.AddTransport(transport.GET{})
	graphql.AddTransport(transport.POST{})
	graphql.SetQueryCache(lru.New[*ast.QueryDocument](queryCacheSize))
	graphql.Use(extension.Introspection{})
	graphql.Use(extension.AutomaticPersistedQuery{Cache: lru.New[string](persistedQuerySize)})
	// The endpoint is public and needs no credentials, so the cost of an operation is capped
	// before the schema reads any data.
	graphql.Use(extension.FixedComplexityLimit(limit))

	mux := http.NewServeMux()
	mux.Handle("/graphql", rules.Limit(rules.RequireContact(graphql)))
	mux.Handle("/", rules.Limit(
		playground.HandlerWithHeaders("ohfootball.io GraphQL", "/graphql", nil, playgroundHeaders),
	))
	mux.HandleFunc("GET /healthz", func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusNoContent)
	})
	// This endpoint reads from the store. Point an uptime check at /healthz instead, because a
	// repeating check here keeps the data source busy and stops it from scaling down.
	mux.HandleFunc("GET /readyz", func(writer http.ResponseWriter, request *http.Request) {
		if err := store.Ping(request.Context()); err != nil {
			http.Error(writer, "data source unavailable", http.StatusServiceUnavailable)
			return
		}
		writer.WriteHeader(http.StatusNoContent)
	})

	return mux, nil
}
