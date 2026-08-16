package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/StephenODea54/services/api/graph/model"
)

type fakeStore struct {
	season  int
	seasons []int
	pingErr error
}

func (fake *fakeStore) Ping(context.Context) error { return fake.pingErr }

func (fake *fakeStore) CurrentSeason(context.Context) (int, error) { return fake.season, nil }

func (fake *fakeStore) Seasons(context.Context) ([]int, error) { return fake.seasons, nil }

func (fake *fakeStore) ListTeams(
	context.Context, *int, *string, *int, *int, *model.TeamSort, *int,
) ([]*model.Team, error) {
	return []*model.Team{}, nil
}

func (fake *fakeStore) Team(context.Context, string, *int) (*model.Team, error) { return nil, nil }

func post(t *testing.T, handler http.Handler, query string) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(map[string]string{"query": query})
	if err != nil {
		t.Fatalf("encode request: %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/graphql", strings.NewReader(string(body)))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func decode(t *testing.T, recorder *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var response map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response %q: %v", recorder.Body.String(), err)
	}
	return response
}

func TestQuery(t *testing.T) {
	handler := New(&fakeStore{season: 2025}, Options{CORSOrigin: "http://localhost:3000"})

	recorder := post(t, handler, "{ currentSeason }")
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body %q", recorder.Code, http.StatusOK, recorder.Body)
	}
	response := decode(t, recorder)
	if _, found := response["errors"]; found {
		t.Fatalf("response carried errors: %v", response["errors"])
	}
	data, _ := response["data"].(map[string]any)
	if season, _ := data["currentSeason"].(float64); season != 2025 {
		t.Fatalf("currentSeason = %v, want 2025", data["currentSeason"])
	}
}

// The playground sends this query every time it loads. It has to stay inside the default limit, or
// the public playground shows an error instead of the schema.
func TestIntrospectionStaysInsideTheDefaultComplexityLimit(t *testing.T) {
	handler := New(&fakeStore{}, Options{})

	recorder := post(t, handler, introspectionQuery)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body %q", recorder.Code, http.StatusOK, recorder.Body)
	}
	if response := decode(t, recorder); response["errors"] != nil {
		t.Fatalf("introspection carried errors: %v", response["errors"])
	}
}

func TestComplexityLimitRejectsARepeatedQuery(t *testing.T) {
	limit := 50
	handler := New(&fakeStore{}, Options{ComplexityLimit: limit})

	var query strings.Builder
	query.WriteString("{")
	for index := range limit + 1 {
		fmt.Fprintf(&query, " field%d: currentSeason", index)
	}
	query.WriteString(" }")

	recorder := post(t, handler, query.String())
	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d, body %q", recorder.Code, http.StatusUnprocessableEntity, recorder.Body)
	}
	if response := decode(t, recorder); response["errors"] == nil {
		t.Fatal("an operation over the limit carried no errors")
	}
}

func TestComplexityLimitFallsBackToTheDefault(t *testing.T) {
	handler := New(&fakeStore{}, Options{ComplexityLimit: 0})

	var query strings.Builder
	query.WriteString("{")
	for index := range DefaultComplexityLimit + 1 {
		fmt.Fprintf(&query, " field%d: currentSeason", index)
	}
	query.WriteString(" }")

	if recorder := post(t, handler, query.String()); recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnprocessableEntity)
	}
	if recorder := post(t, handler, "{ currentSeason }"); recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
}

func TestHealthz(t *testing.T) {
	handler := New(&fakeStore{pingErr: errors.New("unreachable")}, Options{})

	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	// The check answers without reading the store, so a broken store does not change the result.
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNoContent)
	}
}

func TestReadyz(t *testing.T) {
	cases := []struct {
		name    string
		pingErr error
		want    int
	}{
		{name: "store reachable", pingErr: nil, want: http.StatusNoContent},
		{name: "store unreachable", pingErr: errors.New("unreachable"), want: http.StatusServiceUnavailable},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			handler := New(&fakeStore{pingErr: testCase.pingErr}, Options{})
			request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, request)
			if recorder.Code != testCase.want {
				t.Fatalf("status = %d, want %d", recorder.Code, testCase.want)
			}
		})
	}
}

func TestPlayground(t *testing.T) {
	handler := New(&fakeStore{}, Options{})

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if !strings.Contains(recorder.Body.String(), "ohfootball.io GraphQL") {
		t.Fatal("the playground page does not carry the API title")
	}
}

func TestCORS(t *testing.T) {
	handler := New(&fakeStore{}, Options{CORSOrigin: "https://ohfootball.io"})

	request := httptest.NewRequest(http.MethodOptions, "/graphql", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNoContent)
	}
	if origin := recorder.Header().Get("Access-Control-Allow-Origin"); origin != "https://ohfootball.io" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", origin, "https://ohfootball.io")
	}
	if vary := recorder.Header().Get("Vary"); vary != "Origin" {
		t.Fatalf("Vary = %q, want %q", vary, "Origin")
	}
}

// TestWebsocketTransportIsNotAdvertised guards the transport list. A function that returns one
// buffered response cannot hold a websocket open, so the transport must stay out.
func TestWebsocketTransportIsNotAdvertised(t *testing.T) {
	handler := New(&fakeStore{}, Options{})

	request := httptest.NewRequest(http.MethodGet, "/graphql", nil)
	request.Header.Set("Upgrade", "websocket")
	request.Header.Set("Connection", "Upgrade")
	request.Header.Set("Sec-WebSocket-Version", "13")
	request.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code == http.StatusSwitchingProtocols {
		t.Fatal("the server accepted a websocket upgrade")
	}
}

const introspectionQuery = `
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types { ...FullType }
    directives { name description locations args { ...InputValue } }
  }
}
fragment FullType on __Type {
  kind
  name
  description
  fields(includeDeprecated: true) {
    name
    description
    args { ...InputValue }
    type { ...TypeRef }
    isDeprecated
    deprecationReason
  }
  inputFields { ...InputValue }
  interfaces { ...TypeRef }
  enumValues(includeDeprecated: true) {
    name
    description
    isDeprecated
    deprecationReason
  }
  possibleTypes { ...TypeRef }
}
fragment InputValue on __InputValue {
  name
  description
  type { ...TypeRef }
  defaultValue
}
fragment TypeRef on __Type {
  kind
  name
  ofType {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType { kind name ofType { kind name } }
          }
        }
      }
    }
  }
}
`
