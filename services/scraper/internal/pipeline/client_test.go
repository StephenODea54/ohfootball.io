package pipeline

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/StephenODea54/services/scraper/internal/fetch"
	"github.com/StephenODea54/services/scraper/internal/joeeitel"
)

// The real fetch client with the AcceptBody of the site retries an empty team
// page, and then the run skips that team.
func TestSeasonSkipsAnEmptyTeamPageThroughTheFetchClient(t *testing.T) {
	const season = 2001
	var emptyCalls atomic.Int64

	mux := http.NewServeMux()
	mux.HandleFunc("/hsfoot/seasons.jsp", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprintf(w, `<html><body><a href="/hsfoot/rankings/%d/region-1">one</a></body></html>`, season)
	})
	mux.HandleFunc(fmt.Sprintf("/hsfoot/rankings/%d/region-1", season), func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprintf(w, `<html><body><a href="/hsfoot/teams.jsp?teamID=1&amp;year=%d">One</a>`+
			`<a href="/hsfoot/teams.jsp?teamID=200&amp;year=%d">Berea</a></body></html>`, season, season)
	})
	mux.HandleFunc("/hsfoot/teams.jsp", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("teamID") == "200" {
			emptyCalls.Add(1)
			fmt.Fprint(w, "\n\n\n\n")
			return
		}
		fmt.Fprint(w, teamPageHTML(season, "One"))
	})
	server := httptest.NewServer(mux)
	defer server.Close()

	// One retry keeps the backoff of the client under a second.
	const maxRetries = 1
	client := fetch.New(fetch.Options{
		RequestsPerSecond: 1000,
		Timeout:           2 * time.Second,
		MaxRetries:        maxRetries,
		UserAgent:         "test-agent",
		AcceptBody:        joeeitel.AcceptBody,
	})
	sink := &memorySink{}
	runner := &Runner{Client: client, Workers: 2, BaseURL: server.URL}

	summary, err := runner.Season(context.Background(), season, sink)
	if err != nil {
		t.Fatalf("Season returned %v", err)
	}
	if got := emptyCalls.Load(); got != 1+maxRetries {
		t.Errorf("the client read the empty page %d times, want %d", got, 1+maxRetries)
	}
	if summary.EmptyTeamPages != 1 {
		t.Errorf("summary counts %d empty team pages, want 1", summary.EmptyTeamPages)
	}
	if _, stored := sink.teamByID("200"); stored {
		t.Error("the run stored a row for an empty page that no schedule names")
	}
	if _, stored := sink.teamByID("1"); !stored {
		t.Error("the run did not store team 1")
	}
}
