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
	// accuracy is the answer of ModelAccuracy, and accuracyErr its error. A nil accuracy gives an
	// empty answer that has every field the schema needs.
	accuracy    *model.ModelAccuracy
	accuracyErr error
	program     *model.Program
	// programID is the source id that the last call of Program asked for.
	programID string
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

func (fake *fakeStore) Program(_ context.Context, sourceID string) (*model.Program, error) {
	fake.programID = sourceID
	return fake.program, nil
}

func (fake *fakeStore) ModelAccuracy(context.Context, *int, *int) (*model.ModelAccuracy, error) {
	if fake.accuracyErr != nil {
		return nil, fake.accuracyErr
	}
	if fake.accuracy != nil {
		return fake.accuracy, nil
	}
	return emptyAccuracy(), nil
}

// emptyAccuracy is an answer of ModelAccuracy with no games.
func emptyAccuracy() *model.ModelAccuracy {
	return &model.ModelAccuracy{
		Overall:          &model.AccuracyScore{},
		Seasons:          []*model.SeasonAccuracy{},
		Phases:           []*model.PhaseAccuracy{},
		Confidence:       []*model.ConfidenceBin{},
		Upsets:           []*model.ScoredGame{},
		ExactMarginGames: []*model.ScoredGame{},
		WorstWeeks:       []*model.SeasonWeekAccuracy{},
		Current: &model.SeasonReport{
			Weeks:                    []*model.SeasonWeekAccuracy{},
			LastWeekUpsets:           []*model.ScoredGame{},
			LastWeekExactMarginGames: []*model.ScoredGame{},
		},
	}
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

func TestQueryReturnsTheOutOfStateGamesPlayed(t *testing.T) {
	store := &fakeStore{teams: []*model.Team{
		{ID: "many", Record: &model.Record{}, OutOfStateGamesPlayed: 3},
		{ID: "none", Record: &model.Record{}},
	}}
	handler := newHandler(t, store, Options{})

	response := decode(t, post(t, handler, "{ teams { id outOfStateGamesPlayed } }"))
	if _, found := response["errors"]; found {
		t.Fatalf("response carried errors: %v", response["errors"])
	}
	data, _ := response["data"].(map[string]any)
	teams, _ := data["teams"].([]any)
	if len(teams) != 2 {
		t.Fatalf("teams = %v, want 2 teams", data["teams"])
	}
	for index, want := range []float64{3, 0} {
		count, found := teams[index].(map[string]any)["outOfStateGamesPlayed"]
		if !found || count != want {
			t.Fatalf("team %d outOfStateGamesPlayed = %v (present %t), want %v", index, count, found, want)
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

func TestTeamQueryAnswersTheProgramHistory(t *testing.T) {
	team := &model.Team{
		ID:       "massillon",
		SourceID: "1624",
		Record:   &model.Record{},
		ProgramHistory: []*model.ProgramSeason{
			{
				Season:        2002,
				Record:        &model.Record{Wins: 11, Losses: 3},
				PlayoffRecord: &model.Record{Wins: 3, Losses: 1},
				Rating: &model.TeamRating{
					Season: 2002, Rating: 61.2, RelativeRating: 50.5, Rank: 1, AsOf: "2002-12-31",
				},
			},
			{
				Season:        2003,
				Record:        &model.Record{Wins: 2},
				PlayoffRecord: &model.Record{},
			},
		},
	}
	handler := newHandler(t, &fakeStore{team: team}, Options{})

	recorder := post(t, handler, `{
		team(id: "massillon") {
			programHistory {
				season
				record { wins }
				playoffRecord { losses }
				rating { rank relativeRating asOf }
			}
		}
	}`)
	response := decode(t, recorder)
	if _, found := response["errors"]; found {
		t.Fatalf("response carried errors: %v", response["errors"])
	}
	data, _ := response["data"].(map[string]any)
	got, _ := data["team"].(map[string]any)
	history, _ := got["programHistory"].([]any)
	if len(history) != 2 {
		t.Fatalf("programHistory = %v, want 2 seasons", history)
	}
	rated := history[0].(map[string]any)
	if rated["season"] != float64(2002) {
		t.Fatalf("rated season = %v, want 2002", rated)
	}
	if wins := rated["record"].(map[string]any)["wins"]; wins != float64(11) {
		t.Fatalf("record wins = %v, want 11", wins)
	}
	if losses := rated["playoffRecord"].(map[string]any)["losses"]; losses != float64(1) {
		t.Fatalf("playoff losses = %v, want 1", losses)
	}
	rating := rated["rating"].(map[string]any)
	if rating["rank"] != float64(1) || rating["relativeRating"] != 50.5 || rating["asOf"] != "2002-12-31" {
		t.Fatalf("rating = %v, want rank 1 at 50.5 as of 2002-12-31", rating)
	}
	unrated := history[1].(map[string]any)
	if value, found := unrated["rating"]; !found || value != nil {
		t.Fatalf("unrated season rating = %v (present %t), want null", value, found)
	}
}

func TestProgramQueryReturnsTheGames(t *testing.T) {
	rating := &model.TeamRating{Season: 2025, Rating: 40, RelativeRating: 14, Rank: 3, AsOf: "2025-12-31"}
	program := &model.Program{
		SourceID:      "1624",
		RatingHistory: []*model.TeamRating{rating},
		Games: []*model.ProgramGame{{
			Season: 2025, Date: "2025-10-18", OpponentSourceID: "306", OpponentName: "Canton McKinley",
			Location: model.GameLocationHome, Result: model.GameResultWin, TeamScore: 28, OpponentScore: 21,
			Playoff: false,
		}},
	}
	store := &fakeStore{program: program}
	handler := newHandler(t, store, Options{})

	response := decode(t, post(t, handler, `{
		program(sourceId: "1624") {
			sourceId
			ratingHistory { season relativeRating rank }
			games { season date opponentSourceId opponentName location result teamScore opponentScore playoff }
		}
	}`))
	if _, found := response["errors"]; found {
		t.Fatalf("response carried errors: %v", response["errors"])
	}
	if store.programID != "1624" {
		t.Fatalf("the store was asked for %q, want 1624", store.programID)
	}
	data, _ := response["data"].(map[string]any)
	got, _ := data["program"].(map[string]any)
	if got["sourceId"] != "1624" {
		t.Fatalf("sourceId = %v, want 1624", got["sourceId"])
	}
	if value := got["ratingHistory"].([]any)[0].(map[string]any)["relativeRating"]; value != float64(14) {
		t.Fatalf("ratingHistory relativeRating = %v, want 14", value)
	}
	game := got["games"].([]any)[0].(map[string]any)
	want := map[string]any{
		"season": float64(2025), "date": "2025-10-18", "opponentSourceId": "306",
		"opponentName": "Canton McKinley", "location": "HOME", "result": "WIN",
		"teamScore": float64(28), "opponentScore": float64(21), "playoff": false,
	}
	for field, value := range want {
		if game[field] != value {
			t.Errorf("game %s = %v, want %v", field, game[field], value)
		}
	}
}

func TestProgramQueryAnswersNullForAnUnknownProgram(t *testing.T) {
	handler := newHandler(t, &fakeStore{}, Options{})

	response := decode(t, post(t, handler, `{ program(sourceId: "99999") { sourceId } }`))
	if _, found := response["errors"]; found {
		t.Fatalf("response carried errors: %v", response["errors"])
	}
	data, _ := response["data"].(map[string]any)
	if value, found := data["program"]; !found || value != nil {
		t.Fatalf("program = %v (present %t), want null", value, found)
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

func TestModelAccuracyQuery(t *testing.T) {
	accuracy := 0.8078
	answer := emptyAccuracy()
	answer.CurrentSeason, answer.FromSeason = 2026, 2000
	answer.Overall = &model.AccuracyScore{Games: 97688, ExactMargins: 2300, Accuracy: &accuracy}
	answer.Upsets = []*model.ScoredGame{{
		ID: "game", Season: 2011, Week: 6, Date: "2011-09-30",
		Winner:            &model.ScoredTeam{ID: "greenville", SourceID: "678", Name: "Greenville"},
		Loser:             &model.ScoredTeam{ID: "watterson", SourceID: "1720", Name: "Bishop Watterson"},
		WinnerProbability: 0.0037,
	}}
	answer.ExactMarginGames = []*model.ScoredGame{{
		ID: "exact", Season: 2004, Week: 8, Date: "2004-10-16",
		Winner:                &model.ScoredTeam{ID: "ignatius", SourceID: "1354", Name: "St Ignatius"},
		Loser:                 &model.ScoredTeam{ID: "edward", SourceID: "1346", Name: "St Edward"},
		WinnerProbability:     0.8257,
		WinnerPredictedMargin: 15.54,
	}}
	handler := newHandler(t, &fakeStore{accuracy: answer}, Options{})

	response := decode(t, post(t, handler, `{
		modelAccuracy(fromSeason: 2000) {
			fromSeason
			overall { games exactMargins accuracy brierScore }
			upsets { winner { name score } winnerProbability }
			exactMarginGames { winner { name } winnerPredictedMargin }
			current { lastWeek { week } }
		}
	}`))
	if _, found := response["errors"]; found {
		t.Fatalf("response carried errors: %v", response["errors"])
	}
	got := response["data"].(map[string]any)["modelAccuracy"].(map[string]any)
	overall := got["overall"].(map[string]any)
	if got["fromSeason"] != float64(2000) || overall["games"] != float64(97688) || overall["accuracy"] != 0.8078 {
		t.Fatalf("modelAccuracy = %v, want 97688 games at 0.8078 from 2000", got)
	}
	if brier, found := overall["brierScore"]; !found || brier != nil {
		t.Fatalf("brierScore = %v (present %t), want null", brier, found)
	}
	upset := got["upsets"].([]any)[0].(map[string]any)
	if upset["winner"].(map[string]any)["name"] != "Greenville" || upset["winnerProbability"] != 0.0037 {
		t.Fatalf("upset = %v, want Greenville at 0.37%%", upset)
	}
	if overall["exactMargins"] != float64(2300) {
		t.Fatalf("exactMargins = %v, want 2300", overall["exactMargins"])
	}
	exact := got["exactMarginGames"].([]any)[0].(map[string]any)
	if exact["winner"].(map[string]any)["name"] != "St Ignatius" || exact["winnerPredictedMargin"] != 15.54 {
		t.Fatalf("exact margin = %v, want St Ignatius by 15.54", exact)
	}
	if last := got["current"].(map[string]any)["lastWeek"]; last != nil {
		t.Fatalf("lastWeek = %v, want null", last)
	}
}

func TestModelAccuracyRefusesABackwardRange(t *testing.T) {
	store := &fakeStore{accuracyErr: errors.New("fromSeason 2025 is after toSeason 2024")}
	handler := newHandler(t, store, Options{})

	response := decode(t, post(t, handler, "{ modelAccuracy(fromSeason: 2025, toSeason: 2024) { fromSeason } }"))
	errorList, _ := response["errors"].([]any)
	if len(errorList) != 1 || !strings.Contains(fmt.Sprint(errorList[0]), "is after toSeason") {
		t.Fatalf("errors = %v, want the backward range to be refused", response["errors"])
	}
}

// The scores read every stored prediction, so one operation may ask for them only one time.
func TestModelAccuracyIsCostly(t *testing.T) {
	handler := newHandler(t, &fakeStore{}, Options{})

	one := postVariables(t, handler, siteModelAccuracy, map[string]any{"fromSeason": 2000})
	if one.Code != http.StatusOK || decode(t, one)["errors"] != nil {
		t.Fatalf("the query of the site: status = %d, body %.300q, want 200", one.Code, one.Body)
	}
	two := post(t, handler, "{ a: modelAccuracy { currentSeason } b: modelAccuracy { currentSeason } }")
	if two.Code != http.StatusUnprocessableEntity {
		t.Fatalf("two uses: status = %d, want %d", two.Code, http.StatusUnprocessableEntity)
	}
	if code := errorCode(t, two); code != complexityLimitCode {
		t.Fatalf("code = %q, want %q", code, complexityLimitCode)
	}
}
