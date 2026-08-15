// Package server builds the HTTP surface of the API. Every entry point shares this package, so a
// request is handled the same way whether the binary runs as a long lived server or as a function.
package server

import (
	"context"
	"net/http"

	"github.com/99designs/gqlgen/graphql/errcode"
	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/lru"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/99designs/gqlgen/graphql/playground"
	"github.com/StephenODea54/services/api/graph"
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

// Options collects the settings that differ between deployments.
type Options struct {
	// CORSOrigin is the single origin allowed to call the API from a browser.
	CORSOrigin string
	// ComplexityLimit caps the cost of one operation. A value of zero or less selects
	// DefaultComplexityLimit.
	ComplexityLimit int
}

// New returns the complete handler for the API: the GraphQL endpoint, the playground, and the
// health endpoints.
func New(store Store, options Options) http.Handler {
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
	mux.Handle("/graphql", graphql)
	mux.Handle("/", playground.Handler("ohfootball.io GraphQL", "/graphql"))
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

	return cors(mux, options.CORSOrigin)
}

func cors(next http.Handler, origin string) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Access-Control-Allow-Origin", origin)
		writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		writer.Header().Add("Vary", "Origin")
		if request.Method == http.MethodOptions {
			writer.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(writer, request)
	})
}
