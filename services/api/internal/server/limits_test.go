package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/parser"
)

// The queries that the build of the site sends. They are copies of the queries in
// services/frontend/src/features/seasons/api, services/frontend/src/features/teams/api, and
// services/frontend/src/features/accuracy/api, with the fields of team-fields.ts put in. Change
// them together.
const (
	siteTeamFields = `
  id
  season
  sourceId
  name
  mascot
  city
  county
  division
  region
  primaryColor
  secondaryColor
  record { wins losses ties }
  outOfStateGamesPlayed
  rating { season value: relativeRating rank previousRank asOf }
`
	siteCurrentSeason = `query CurrentSeason { currentSeason }`
	siteTeams         = `query Teams($season: Int!) {
  teams(season: $season, sort: RATING, limit: 1000) {` + siteTeamFields + `}
}`
	siteTeam = `query Team($id: ID!, $season: Int) {
  team(id: $id, season: $season) {` + siteTeamFields + `
    ratingHistory { season value: relativeRating rank previousRank asOf }
    schedule {
      id
      week
      date
      opponentId
      opponentName
      location
      result
      teamScore
      opponentScore
      playoff
      notes
      prediction { winProbability predictedMargin asOf }
    }
    programHistory {
      season
      record { wins losses ties }
      playoffRecord { wins losses ties }
      rating { value: relativeRating rank }
    }
  }
}`
	siteModelAccuracy = `query ModelAccuracy($fromSeason: Int!) {
  modelAccuracy(fromSeason: $fromSeason) {
    currentSeason
    fromSeason
    overall { ...Score }
    seasons { season pendingGames inProgress score { ...Score } }
    phases { phase score { ...Score } }
    confidence { lowerBound upperBound games ties meanProbability favoriteWins observedRate accuracy }
    upsets { ...Game }
    worstWeeks { ...Week }
    current {
      season
      weeks { ...Week }
      lastWeek { ...Week }
      lastWeekUpsets { ...Game }
    }
  }
}

fragment Score on AccuracyScore {
  games ties decided correct accuracy expectedCorrect brierScore logLoss
}

fragment Week on SeasonWeekAccuracy {
  season week firstDate lastDate pendingGames score { ...Score }
}

fragment Game on ScoredGame {
  id season date
  winner { id sourceId name score }
  loser { id sourceId name score }
  winnerProbability
}`
)

// aliasDocument asks for the schema under many aliases, until the document has size bytes.
func aliasDocument(size int) string {
	var document strings.Builder
	document.WriteString("{")
	for index := 0; document.Len() < size; index++ {
		fmt.Fprintf(&document, "a%d:__schema{types{name fields{name type{name kind}}}}", index)
	}
	document.WriteString("}")
	return document.String()
}

// fanOutDocument uses each fragment of the first level width times, and each such use reaches
// the fragment of the second level three times. The number of fields grows as width squared.
func fanOutDocument(width int) string {
	var document strings.Builder
	document.WriteString("{__schema{types{...L0}}}\nfragment L0 on __Type {")
	for index := range width {
		fmt.Fprintf(&document, " f%d: fields { type { ...U0 } }", index)
	}
	document.WriteString(" }\nfragment U0 on __Type { ...L1 ofType { ...L1 ofType { ...L1 } } }\nfragment L1 on __Type {")
	for index := range width {
		fmt.Fprintf(&document, " f%d: fields { name }", index)
	}
	document.WriteString(" }\n")
	return document.String()
}

// aliasesOf selects __typename count times, each under its own alias. Each alias adds three
// tokens and one field.
func aliasesOf(count int) string {
	var document strings.Builder
	document.WriteString("{")
	for index := range count {
		fmt.Fprintf(&document, " a%d: __typename", index)
	}
	document.WriteString(" }")
	return document.String()
}

func fieldsOf(t *testing.T, query string) int {
	t.Helper()
	document, err := parser.ParseQuery(&ast.Source{Input: query})
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	return countFields(document, DefaultFieldLimit)
}

func postVariables(t *testing.T, handler http.Handler, query string, variables map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(map[string]any{"query": query, "variables": variables})
	if err != nil {
		t.Fatalf("encode request: %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/graphql", strings.NewReader(string(body)))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("User-Agent", contactAgent)
	return serve(handler, request)
}

// refusedWith checks the status and the code of the error, and that no data came back.
func refusedWith(t *testing.T, recorder *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	if recorder.Code != status {
		t.Fatalf("status = %d, want %d, body %.300q", recorder.Code, status, recorder.Body)
	}
	if got := errorCode(t, recorder); got != code {
		t.Fatalf("code = %q, want %q", got, code)
	}
	if data := decode(t, recorder)["data"]; data != nil {
		t.Fatalf("a refused operation returned data: %.200v", data)
	}
}

func TestExpensiveIntrospectionIsRefusedFast(t *testing.T) {
	cases := []struct {
		name, query, code string
	}{
		{"schema under many aliases", aliasDocument(10_000), codeFieldLimit},
		{"fragments that fan out", fanOutDocument(40), codeFieldLimit},
		{"a document of 100 KB", aliasDocument(100_000), codeTokenLimit},
		// Validation compares each pair of fields with the same name, so this is slow to
		// validate. The limit must refuse it before validation.
		{"one alias many times", "{" + strings.Repeat(" a: __typename", 3000) + " }", codeFieldLimit},
		{"a fragment that no operation uses", "{ __typename } fragment F on Query {" +
			strings.Repeat(" a: __typename", 3000) + " }", codeFieldLimit},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			handler := newHandler(t, &fakeStore{}, Options{})
			start := time.Now()
			recorder := post(t, handler, testCase.query)
			if elapsed := time.Since(start); elapsed > 100*time.Millisecond {
				t.Fatalf("the refusal took %v, want less than 100ms", elapsed)
			}
			refusedWith(t, recorder, http.StatusUnprocessableEntity, testCase.code)
		})
	}
}

func TestFieldLimitRunsBeforeAnyResolver(t *testing.T) {
	store := &fakeStore{season: 2025}
	handler := newHandler(t, store, Options{})
	query := strings.ReplaceAll(aliasesOf(DefaultFieldLimit+1), "__typename", "currentSeason")

	refusedWith(t, post(t, handler, query), http.StatusUnprocessableEntity, codeFieldLimit)
	if store.calls != 0 {
		t.Fatalf("the store was called %d times, want 0", store.calls)
	}
}

func TestFieldLimitCountsEachAlias(t *testing.T) {
	handler := newHandler(t, &fakeStore{}, Options{FieldLimit: 2})

	if recorder := post(t, handler, aliasesOf(2)); recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body %q", recorder.Code, recorder.Body)
	}
	refusedWith(t, post(t, handler, aliasesOf(3)), http.StatusUnprocessableEntity, codeFieldLimit)
}

func TestQueriesThatMustPassTheFieldLimit(t *testing.T) {
	cases := []struct {
		name, query string
		variables   map[string]any
		most        int
	}{
		{"the introspection of GraphiQL", graphiqlIntrospection(t), nil, 300},
		{"the current season of the site", siteCurrentSeason, nil, 100},
		{"the teams of the site", siteTeams, map[string]any{"season": 2025}, 100},
		{"one team of the site", siteTeam, map[string]any{"id": "x", "season": 2025}, 100},
		{"the scores of the site", siteModelAccuracy, map[string]any{"fromSeason": 2000}, 250},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			count := fieldsOf(t, testCase.query)
			t.Logf("%s selects %d fields", testCase.name, count)
			if count > testCase.most {
				t.Fatalf("the query selects %d fields, want at most %d", count, testCase.most)
			}
			recorder := postVariables(t, newHandler(t, &fakeStore{}, Options{}), testCase.query, testCase.variables)
			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200, body %.300q", recorder.Code, recorder.Body)
			}
			if response := decode(t, recorder); response["errors"] != nil {
				t.Fatalf("the query carried errors: %v", response["errors"])
			}
		})
	}
}

func TestGraphiQLIntrospectionSelectsAbout220Fields(t *testing.T) {
	if count := fieldsOf(t, graphiqlIntrospection(t)); count < 200 || count > 240 {
		t.Fatalf("the introspection of GraphiQL selects %d fields, want about 220", count)
	}
}

func TestCountFields(t *testing.T) {
	cases := []struct {
		name, query string
		want        int
	}{
		{"fields and aliases", "{ a: __typename b: __typename __schema { types { name } } }", 5},
		{"an inline fragment", "{ ... on Query { __typename } }", 1},
		{"a fragment used twice", "{ a: __schema { ...S } b: __schema { ...S } } fragment S on __Schema { types { name } }", 6},
		{"a fragment that is missing", "{ ...Missing }", 0},
		{"a fragment that uses itself", "{ ...A } fragment A on Query { __typename ...A }", DefaultFieldLimit + 1},
		{"each operation", "query A { __typename } query B { a: __typename b: __typename }", 3},
		{"a fragment that no operation uses", "{ __typename } fragment F on Query { a: __typename b: __typename }", 3},
		{"a second fragment with the same name", "{ ...F } fragment F on Query { __typename } fragment F on Query { a: __typename b: __typename }", 3},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := fieldsOf(t, testCase.query); got != testCase.want {
				t.Fatalf("countFields = %d, want %d", got, testCase.want)
			}
		})
	}
}

func TestTokenLimit(t *testing.T) {
	handler := newHandler(t, &fakeStore{}, Options{FieldLimit: 1 << 20, ComplexityLimit: 1 << 20})

	// Each alias adds three tokens, and the braces add two.
	under := aliasesOf((parserTokenLimit - 10) / 3)
	if recorder := post(t, handler, under); recorder.Code != http.StatusOK {
		t.Fatalf("under the limit: status = %d, want 200, body %.300q", recorder.Code, recorder.Body)
	}
	refusedWith(t, post(t, handler, aliasesOf(parserTokenLimit/3+1)), http.StatusUnprocessableEntity, codeTokenLimit)
}

func TestTokenLimitLeavesSyntaxErrorsToGqlgen(t *testing.T) {
	recorder := post(t, newHandler(t, &fakeStore{}, Options{}), "{ __typename")
	refusedWith(t, recorder, http.StatusUnprocessableEntity, "GRAPHQL_PARSE_FAILED")
}

func TestBodyLimit(t *testing.T) {
	handler := newHandler(t, &fakeStore{}, Options{})
	send := func(size int) *httptest.ResponseRecorder {
		prefix := `{"query":"{ __typename }","padding":"`
		body := prefix + strings.Repeat("a", size-len(prefix)-2) + `"}`
		request := httptest.NewRequest(http.MethodPost, "/graphql", strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("User-Agent", contactAgent)
		return serve(handler, request)
	}

	if recorder := send(maxRequestBody); recorder.Code != http.StatusOK {
		t.Fatalf("a body of the largest size: status = %d, want 200, body %.300q", recorder.Code, recorder.Body)
	}
	recorder := send(maxRequestBody + 1)
	refusedWith(t, recorder, http.StatusRequestEntityTooLarge, codeBodyTooLarge)
	if contentType := recorder.Header().Get("Content-Type"); contentType != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", contentType)
	}
}

type failingBody struct{}

func (failingBody) Read([]byte) (int, error) { return 0, errors.New("connection reset") }

func TestBodyThatCannotBeRead(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/graphql", failingBody{})
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("User-Agent", contactAgent)

	refusedWith(t, serve(newHandler(t, &fakeStore{}, Options{}), request), http.StatusBadRequest, codeBodyUnread)
}

func TestQueryLimitsHasAName(t *testing.T) {
	if name := (queryLimits{}).ExtensionName(); name != "QueryLimits" {
		t.Fatalf("ExtensionName = %q, want QueryLimits", name)
	}
}
