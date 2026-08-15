package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/StephenODea54/services/api/internal/store"
	_ "modernc.org/sqlite"
)

// writeSnapshot builds the smallest snapshot the API can answer from: one Ohio team, which gives
// the current season a value.
func writeSnapshot(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "ohfootball.db")

	writer, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("create snapshot: %v", err)
	}
	defer writer.Close()
	if _, err := writer.Exec(store.SQLiteSchema); err != nil {
		t.Fatalf("apply schema: %v", err)
	}
	if _, err := writer.Exec(`
		INSERT INTO dim_teams (team_key, source_id, season, state_code, name)
		VALUES ('team-a-2025', 'src-a', 2025, 'OH', 'Avon')
	`); err != nil {
		t.Fatalf("load snapshot: %v", err)
	}
	return path
}

func TestNewHandlerAnswersFromTheSnapshot(t *testing.T) {
	handler, err := newHandler(writeSnapshot(t))
	if err != nil {
		t.Fatalf("newHandler = %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("readyz = %d, want %d", recorder.Code, http.StatusNoContent)
	}

	body := strings.NewReader(`{"query":"{ currentSeason }"}`)
	request = httptest.NewRequest(http.MethodPost, "/graphql", body)
	request.Header.Set("Content-Type", "application/json")
	recorder = httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("graphql = %d, want %d, body %q", recorder.Code, http.StatusOK, recorder.Body)
	}

	var response struct {
		Data struct {
			CurrentSeason int `json:"currentSeason"`
		} `json:"data"`
		Errors []any `json:"errors"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode %q: %v", recorder.Body.String(), err)
	}
	if len(response.Errors) > 0 {
		t.Fatalf("response carried errors: %v", response.Errors)
	}
	if response.Data.CurrentSeason != 2025 {
		t.Fatalf("currentSeason = %d, want 2025", response.Data.CurrentSeason)
	}
}

// The deployed API is called from the site, not from a development server, so the default origin
// has to be the site.
func TestNewHandlerAllowsTheSiteByDefault(t *testing.T) {
	handler, err := newHandler(writeSnapshot(t))
	if err != nil {
		t.Fatalf("newHandler = %v", err)
	}

	request := httptest.NewRequest(http.MethodOptions, "/graphql", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if origin := recorder.Header().Get("Access-Control-Allow-Origin"); origin != "https://ohfootball.io" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", origin, "https://ohfootball.io")
	}
}

func TestNewHandlerReportsAMissingSnapshot(t *testing.T) {
	if _, err := newHandler(filepath.Join(t.TempDir(), "absent.db")); err == nil {
		t.Fatal("a missing snapshot was accepted")
	}
}

func TestNewHandlerReportsAnUnreadableSetting(t *testing.T) {
	t.Setenv("ELO_RATING_SCALE", "four hundred")
	if _, err := newHandler(writeSnapshot(t)); err == nil {
		t.Fatal("an unreadable setting was accepted")
	}
}
