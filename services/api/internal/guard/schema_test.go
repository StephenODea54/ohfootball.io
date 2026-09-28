package guard

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/StephenODea54/services/api/internal/ratelimit"
)

func graphiqlIntrospection(t *testing.T) string {
	t.Helper()
	query, err := os.ReadFile("testdata/graphiql-introspection.graphql")
	if err != nil {
		t.Fatalf("read the introspection query: %v", err)
	}
	return string(query)
}

func TestIsSchemaDocument(t *testing.T) {
	cases := []struct {
		name, query string
		want        bool
	}{
		{"the introspection of GraphiQL", graphiqlIntrospection(t), true},
		{"__typename", "{ __typename }", true},
		{"__type with a name", `query { __type(name: "Team") { name fields { name } } }`, true},
		{"an alias on a schema field", "{ season: __typename }", true},
		{"a fragment inside a schema field", "{ __schema { ...S } } fragment S on __Schema { types { name } }", true},
		{"two operations that read the schema", "query A { __typename } query B { __schema { types { name } } }", true},
		{"a data field", "{ currentSeason }", false},
		{"a data field next to the schema", "{ __typename currentSeason }", false},
		{"an alias that hides a data field", "{ __schema: currentSeason }", false},
		{"a second operation that reads data", "query A { __typename } query B { currentSeason }", false},
		{"a mutation", "mutation { __typename }", false},
		{"a subscription", "subscription { __typename }", false},
		{"a fragment spread at the top", "{ ...Root } fragment Root on Query { __typename }", false},
		{"an inline fragment at the top", "{ ... on Query { __typename } }", false},
		{"only a fragment", "fragment S on __Schema { types { name } }", false},
		{"an empty query", "", false},
		{"a query that does not parse", "{ __typename", false},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := isSchemaDocument(testCase.query); got != testCase.want {
				t.Fatalf("isSchemaDocument = %v, want %v", got, testCase.want)
			}
		})
	}
}

// bodyRequest builds a POST with no contact and the body.
func bodyRequest(body io.Reader) *http.Request {
	request := httptest.NewRequest(http.MethodPost, "/graphql", body)
	request.RemoteAddr = "192.0.2.10:5000"
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("User-Agent", "curl/8.7.1")
	return request
}

func jsonBody(t *testing.T, value any) string {
	t.Helper()
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("encode body: %v", err)
	}
	return string(body)
}

type failingReader struct{}

func (failingReader) Read([]byte) (int, error) { return 0, errors.New("connection reset") }

func TestSchemaQueriesNeedNoContact(t *testing.T) {
	introspection := jsonBody(t, map[string]string{
		"query": graphiqlIntrospection(t), "operationName": "IntrospectionQuery",
	})
	cases := []struct {
		name    string
		request func() *http.Request
	}{
		{"the introspection of GraphiQL", func() *http.Request {
			return bodyRequest(strings.NewReader(introspection))
		}},
		{"__typename", func() *http.Request {
			return bodyRequest(strings.NewReader(`{"query":"{ __typename }"}`))
		}},
		{"__type", func() *http.Request {
			return bodyRequest(strings.NewReader(`{"query":"{ __type(name: \"Team\") { name } }"}`))
		}},
		{"a body of the largest size", func() *http.Request {
			body := `{"query":"{ __typename }","padding":""}`
			padding := strings.Repeat("a", maxSchemaBody-len(body))
			return bodyRequest(strings.NewReader(`{"query":"{ __typename }","padding":"` + padding + `"}`))
		}},
		{"a GET", func() *http.Request {
			request := httptest.NewRequest(http.MethodGet, "/graphql?query="+url.QueryEscape("{ __typename }"), nil)
			request.Header.Set("User-Agent", "curl/8.7.1")
			return request
		}},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			fixture := newFixture(t, ratelimit.DefaultLimits(), "")
			if recorder := serve(fixture.guard.RequireContact(ok), testCase.request()); recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200, body %q", recorder.Code, recorder.Body)
			}
			if logs := fixture.logs.String(); !strings.Contains(logs, "schema=true") {
				t.Fatalf("log %q does not mark the request as a schema query", logs)
			}
		})
	}
}

func TestSchemaQueryKeepsTheBody(t *testing.T) {
	fixture := newFixture(t, ratelimit.DefaultLimits(), "")
	body := `{"query":"{ __typename }","operationName":null}`
	var read string
	next := http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		data, err := io.ReadAll(request.Body)
		if err != nil {
			t.Errorf("read the body: %v", err)
		}
		read = string(data)
		if err := request.Body.Close(); err != nil {
			t.Errorf("close the body: %v", err)
		}
		writer.WriteHeader(http.StatusOK)
	})

	if recorder := serve(fixture.guard.RequireContact(next), bodyRequest(strings.NewReader(body))); recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", recorder.Code)
	}
	if read != body {
		t.Fatalf("the next handler read %q, want %q", read, body)
	}
}

func TestOtherQueriesStillNeedAContact(t *testing.T) {
	cases := []struct {
		name    string
		request func() *http.Request
	}{
		{"a data query", func() *http.Request {
			return bodyRequest(strings.NewReader(`{"query":"{ currentSeason }"}`))
		}},
		{"a data query next to the schema", func() *http.Request {
			return bodyRequest(strings.NewReader(`{"query":"{ __typename currentSeason }"}`))
		}},
		{"a mutation", func() *http.Request {
			return bodyRequest(strings.NewReader(`{"query":"mutation { __typename }"}`))
		}},
		{"a fragment spread at the top", func() *http.Request {
			return bodyRequest(strings.NewReader(`{"query":"{ ...R } fragment R on Query { __typename }"}`))
		}},
		{"a persisted query with no text", func() *http.Request {
			return bodyRequest(strings.NewReader(`{"extensions":{"persistedQuery":{"version":1,"sha256Hash":"abc"}}}`))
		}},
		{"a body that is not JSON", func() *http.Request {
			return bodyRequest(strings.NewReader(`{"query":"{ __typename }"`))
		}},
		{"a batch", func() *http.Request {
			return bodyRequest(strings.NewReader(`[{"query":"{ __typename }"}]`))
		}},
		{"a body over the largest size", func() *http.Request {
			body := `{"query":"{ __typename }","padding":""}`
			padding := strings.Repeat("a", maxSchemaBody-len(body)+1)
			return bodyRequest(strings.NewReader(`{"query":"{ __typename }","padding":"` + padding + `"}`))
		}},
		{"a body that cannot be read", func() *http.Request {
			return bodyRequest(failingReader{})
		}},
		{"no body", func() *http.Request {
			request := bodyRequest(nil)
			request.Body = nil
			return request
		}},
		{"a GET of a data query", func() *http.Request {
			return httptest.NewRequest(http.MethodGet, "/graphql?query="+url.QueryEscape("{ currentSeason }"), nil)
		}},
		{"a GET with a URL that does not parse", func() *http.Request {
			request := httptest.NewRequest(http.MethodGet, "/graphql", nil)
			request.URL.RawQuery = "query=%zz"
			return request
		}},
		{"another method", func() *http.Request {
			request := bodyRequest(strings.NewReader(`{"query":"{ __typename }"}`))
			request.Method = http.MethodPut
			return request
		}},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			fixture := newFixture(t, ratelimit.DefaultLimits(), "")
			recorder := serve(fixture.guard.RequireContact(ok), testCase.request())
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400", recorder.Code)
			}
			if _, code := decodeError(t, recorder); code != CodeContactRequired {
				t.Fatalf("code = %q, want %q", code, CodeContactRequired)
			}
		})
	}
}

func TestSchemaQueriesCountTowardTheLimits(t *testing.T) {
	limits := ratelimit.Limits{
		PerAddress: ratelimit.Rate{PerSecond: 1, Burst: 1},
		Total:      ratelimit.Rate{PerSecond: 1000, Burst: 1000},
	}
	fixture := newFixture(t, limits, "")
	handler := fixture.guard.Limit(fixture.guard.RequireContact(ok))
	send := func() int {
		return serve(handler, bodyRequest(strings.NewReader(`{"query":"{ __typename }"}`))).Code
	}

	if status := send(); status != http.StatusOK {
		t.Fatalf("status = %d, want 200", status)
	}
	if status := send(); status != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", status)
	}
}
