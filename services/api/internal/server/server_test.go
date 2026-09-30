package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/StephenODea54/services/api/graph/model"
)

// contactAgent is a User-Agent that names a contact, as the API asks of every caller.
const contactAgent = "server-test/1.0 (test@example.com)"

const siteBuildKey = "probe-build-key-123456"

type fakeStore struct {
	season  int
	pingErr error
	teams   []*model.Team
	team    *model.Team
	// calls counts the calls of CurrentSeason, so a test can tell that no resolver ran.
	calls int
}

func (fake *fakeStore) Ping(context.Context) error { return fake.pingErr }

func (fake *fakeStore) CurrentSeason(context.Context) (int, error) {
	fake.calls++
	return fake.season, nil
}

func (fake *fakeStore) Seasons(context.Context) ([]int, error) { return nil, nil }

func (fake *fakeStore) ListTeams(
	context.Context, *int, *string, *int, *int, *model.TeamSort, *int,
) ([]*model.Team, error) {
	if fake.teams == nil {
		return []*model.Team{}, nil
	}
	return fake.teams, nil
}

func (fake *fakeStore) Team(context.Context, string, *int) (*model.Team, error) {
	return fake.team, nil
}

func newHandler(t *testing.T, store Store, options Options) http.Handler {
	t.Helper()
	handler, err := New(store, options)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return handler
}

// graphqlRequest builds a POST of the query that names a contact in its User-Agent. A test
// changes or removes the headers when it checks the rules of the guard.
func graphqlRequest(t *testing.T, query string) *http.Request {
	t.Helper()
	body, err := json.Marshal(map[string]string{"query": query})
	if err != nil {
		t.Fatalf("encode request: %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/graphql", strings.NewReader(string(body)))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("User-Agent", contactAgent)
	return request
}

// graphiqlIntrospection reads the introspection query that GraphiQL sends. The package guard holds
// the file, because its tests use the query too.
func graphiqlIntrospection(t *testing.T) string {
	t.Helper()
	query, err := os.ReadFile("../guard/testdata/graphiql-introspection.graphql")
	if err != nil {
		t.Fatalf("read the introspection query: %v", err)
	}
	return string(query)
}

func serve(handler http.Handler, request *http.Request) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func post(t *testing.T, handler http.Handler, query string) *httptest.ResponseRecorder {
	t.Helper()
	return serve(handler, graphqlRequest(t, query))
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
	handler := newHandler(t, &fakeStore{season: 2025}, Options{})

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

func TestQueryReturnsThePreviousRank(t *testing.T) {
	previousRank := 15
	rated := func(id string, previous *int) *model.Team {
		return &model.Team{
			ID:     id,
			Record: &model.Record{},
			Rating: &model.TeamRating{Season: 2026, Rating: 40, RelativeRating: 14, Rank: 12, PreviousRank: previous},
		}
	}
	store := &fakeStore{teams: []*model.Team{rated("moved", &previousRank), rated("new", nil)}}
	handler := newHandler(t, store, Options{})

	recorder := post(t, handler, "{ teams { id rating { rank previousRank relativeRating } } }")
	response := decode(t, recorder)
	if _, found := response["errors"]; found {
		t.Fatalf("response carried errors: %v", response["errors"])
	}
	data, _ := response["data"].(map[string]any)
	teams, _ := data["teams"].([]any)
	if len(teams) != 2 {
		t.Fatalf("teams = %v, want 2 teams", data["teams"])
	}
	want := []any{float64(15), nil}
	for index, entry := range teams {
		rating, _ := entry.(map[string]any)["rating"].(map[string]any)
		if rating["relativeRating"] != float64(14) {
			t.Fatalf("team %d relativeRating = %v, want 14", index, rating["relativeRating"])
		}
		previous, found := rating["previousRank"]
		if !found || previous != want[index] {
			t.Fatalf("team %d previousRank = %v (present %t), want %v", index, previous, found, want[index])
		}
	}
}

func TestATeamAnswersWithItsRatingHistoryAndPredictedMargins(t *testing.T) {
	rating := &model.TeamRating{Season: 2026, Rating: 40, RelativeRating: 14, Rank: 3, AsOf: "2026-09-29"}
	team := &model.Team{
		ID:            "moeller",
		SourceID:      "1068",
		Record:        &model.Record{},
		Rating:        rating,
		RatingHistory: []*model.TeamRating{rating},
		Schedule: []*model.Game{{
			ID: "game", Date: "2026-10-02", OpponentID: "elder", OpponentName: "Elder",
			Location: model.GameLocationHome, Result: model.GameResultUnknown,
			Prediction: &model.GamePrediction{
				WinProbability: 0.61, PredictedResult: model.GameResultWin, PredictedMargin: 4.2,
				TeamRating: 40, OpponentRating: 37, AsOf: "2026-09-29",
			},
		}},
	}
	handler := newHandler(t, &fakeStore{team: team}, Options{})

	recorder := post(t, handler, `{
		team(id: "moeller") {
			sourceId
			rating { relativeRating }
			ratingHistory { relativeRating }
			schedule { prediction { predictedMargin } }
		}
	}`)
	response := decode(t, recorder)
	if _, found := response["errors"]; found {
		t.Fatalf("response carried errors: %v", response["errors"])
	}
	data, _ := response["data"].(map[string]any)
	got, _ := data["team"].(map[string]any)
	if value := got["sourceId"]; value != "1068" {
		t.Fatalf("sourceId = %v, want 1068", value)
	}
	if value := got["rating"].(map[string]any)["relativeRating"]; value != float64(14) {
		t.Fatalf("rating relativeRating = %v, want 14", value)
	}
	if value := got["ratingHistory"].([]any)[0].(map[string]any)["relativeRating"]; value != float64(14) {
		t.Fatalf("ratingHistory relativeRating = %v, want 14", value)
	}
	schedule, _ := got["schedule"].([]any)
	margin := schedule[0].(map[string]any)["prediction"].(map[string]any)["predictedMargin"]
	if margin != 4.2 {
		t.Fatalf("predictedMargin = %v, want 4.2", margin)
	}
}

func TestTheEloNamesAreGone(t *testing.T) {
	handler := newHandler(t, &fakeStore{}, Options{})

	recorder := post(t, handler, "{ teams(sort: ELO) { id elo { rank } } }")
	response := decode(t, recorder)
	if _, found := response["errors"]; !found {
		t.Fatalf("response = %v, want errors for the removed names", response)
	}
}

// The playground sends this query every time it loads. It has to stay inside the default limit, or
// the public playground shows an error instead of the schema.
func TestIntrospectionStaysInsideTheDefaultComplexityLimit(t *testing.T) {
	handler := newHandler(t, &fakeStore{}, Options{})

	recorder := post(t, handler, graphiqlIntrospection(t))
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body %q", recorder.Code, http.StatusOK, recorder.Body)
	}
	if response := decode(t, recorder); response["errors"] != nil {
		t.Fatalf("introspection carried errors: %v", response["errors"])
	}
}

func TestComplexityLimitRejectsARepeatedQuery(t *testing.T) {
	limit := 50
	handler := newHandler(t, &fakeStore{}, Options{ComplexityLimit: limit})

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
	handler := newHandler(t, &fakeStore{}, Options{ComplexityLimit: 0})

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
	handler := newHandler(t, &fakeStore{pingErr: errors.New("unreachable")}, Options{})

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
			handler := newHandler(t, &fakeStore{pingErr: testCase.pingErr}, Options{})
			request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, request)
			if recorder.Code != testCase.want {
				t.Fatalf("status = %d, want %d", recorder.Code, testCase.want)
			}
		})
	}
}

// No page of ohfootball.io calls the API from a browser, and the playground is on the origin of
// the API. So the API sends no CORS headers, and a page on another origin cannot read it.
func TestNoCORSHeaders(t *testing.T) {
	handler := newHandler(t, &fakeStore{}, Options{})

	request := httptest.NewRequest(http.MethodOptions, "/graphql", nil)
	request.Header.Set("Origin", "https://example.org")
	request.Header.Set("User-Agent", contactAgent)
	recorder := serve(handler, request)

	for name := range recorder.Header() {
		if strings.HasPrefix(name, "Access-Control-") {
			t.Fatalf("the API sent the CORS header %s", name)
		}
	}
}

// A function that returns one buffered response cannot hold a websocket open, so the websocket
// transport must stay out of the transport list.
func TestWebsocketTransportIsNotAdvertised(t *testing.T) {
	handler := newHandler(t, &fakeStore{}, Options{})

	request := httptest.NewRequest(http.MethodGet, "/graphql", nil)
	request.Header.Set("Upgrade", "websocket")
	request.Header.Set("Connection", "Upgrade")
	request.Header.Set("Sec-WebSocket-Version", "13")
	request.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	request.Header.Set("User-Agent", contactAgent)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code == http.StatusSwitchingProtocols {
		t.Fatal("the server accepted a websocket upgrade")
	}
}
