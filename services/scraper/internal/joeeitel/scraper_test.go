package joeeitel

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestNewRejectsSeasonBefore2000(t *testing.T) {
	config := DefaultConfig()
	config.Season = 1999

	_, err := New(config)
	if err == nil || !strings.Contains(err.Error(), "at least 2000") {
		t.Fatalf("got error %v, want minimum season error", err)
	}
}

func TestScrapeRejectsDiscoveredSeasonBefore2000(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(response, `<a href="seasons.jsp?year=1999">1999</a>`)
	}))
	defer server.Close()

	config := DefaultConfig()
	config.BaseURL = server.URL
	config.RequestsPerSecond = 1000
	scraper, err := New(config)
	if err != nil {
		t.Fatal(err)
	}

	_, err = scraper.Scrape(t.Context())
	if err == nil || !strings.Contains(err.Error(), "before 2000") {
		t.Fatalf("got error %v, want discovered season error", err)
	}
}

func TestScrapeStopsAfterOpponentMetadata(t *testing.T) {
	var mutex sync.Mutex
	requests := make(map[string]int)

	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		mutex.Lock()
		requests[request.URL.Path+"?"+request.URL.RawQuery]++
		mutex.Unlock()

		response.Header().Set("Content-Type", "text/html")
		switch {
		case request.URL.Path == "/hsfoot/seasons.jsp":
			fmt.Fprint(response, `<a href="/hsfoot/rankings/2025/region-1">Region 1</a>`)
		case request.URL.Path == "/hsfoot/rankings/2025/region-1":
			fmt.Fprint(response, `<a href="/hsfoot/teams.jsp?year=2025&amp;teamID=1">Ohio Seed</a>`)
		case request.URL.Path == "/hsfoot/teams.jsp" && request.URL.Query().Get("teamID") == "1":
			fmt.Fprint(response, testTeamPage("Ohio Seed Tigers", "Ohio Seed", "Springfield, OH", "2", "Outstate School (PA)"))
		case request.URL.Path == "/hsfoot/teams.jsp" && request.URL.Query().Get("teamID") == "2":
			fmt.Fprint(response, testTeamPage("Outstate School Lions", "Outstate School", "Erie, PA", "3", "Another School (NY)"))
		case request.URL.Path == "/hsfoot/teams.jsp" && request.URL.Query().Get("teamID") == "3":
			t.Error("scraper followed an opponent's schedule")
			http.Error(response, "crawl went too deep", http.StatusInternalServerError)
		default:
			http.NotFound(response, request)
		}
	}))
	defer server.Close()

	scraper, err := New(Config{
		BaseURL:           server.URL,
		Season:            2025,
		Workers:           3,
		RequestsPerSecond: 1000,
		RequestTimeout:    2 * time.Second,
		MaxRetries:        0,
		UserAgent:         "scraper-test",
	})
	if err != nil {
		t.Fatal(err)
	}
	result, err := scraper.Scrape(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Errors) != 0 {
		t.Fatalf("unexpected page errors: %v", result.Errors)
	}
	if len(result.OHSAATeams) != 1 || len(result.OpponentTeams) != 1 {
		t.Fatalf("unexpected team counts: OHSAA=%d opponent=%d", len(result.OHSAATeams), len(result.OpponentTeams))
	}
	if result.DiscoveredOpponents != 1 || len(result.Games) != 1 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if result.OpponentTeams[0].TeamID != "2" || result.OpponentTeams[0].Name != "Outstate School" {
		t.Fatalf("unexpected opponent metadata: %+v", result.OpponentTeams[0])
	}

	mutex.Lock()
	defer mutex.Unlock()
	if requests["/hsfoot/teams.jsp?teamID=3&year=2025"] != 0 {
		t.Fatalf("team 3 was requested: %v", requests)
	}
}

func testTeamPage(displayName, schoolName, location, opponentID, opponentName string) string {
	return fmt.Sprintf(`<html><body>
<div id="header" style="background-color:#111;color:#eee"><h2>%s</h2><h4><br>%s<br></h4></div>
<table class="schedule"><caption><strong>2025 %s Football (1-0)</strong><br>Division I</caption><tbody><tr>
<td class="gameDate">8/1</td><td class="homeAway">H</td><td class="opponent"><a class="teamLink" href="teams.jsp?teamID=%s&amp;year=2025">%s <span class="wltRecord">(0-1)</span></a></td><td class="divisionRegion"></td><td class="result">W</td><td class="score">7-0</td><td class="resultNote"></td>
</tr></tbody></table></body></html>`, displayName, location, schoolName, opponentID, opponentName)
}
