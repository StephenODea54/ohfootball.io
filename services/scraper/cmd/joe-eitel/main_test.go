package main

import (
	"encoding/json"
	"errors"
	"slices"
	"testing"

	"github.com/StephenODea54/services/scraper/internal/config"
	"github.com/StephenODea54/services/scraper/internal/pipeline"
	"github.com/StephenODea54/services/scraper/internal/store"
)

func TestTargetSeasons(t *testing.T) {
	listed := []int{2023, 2024, 2025}

	tests := []struct {
		name        string
		config      config.Config
		want        []int
		wantSkipped bool
	}{
		{
			name:   "every season",
			config: config.Config{AllSeasons: true},
			want:   listed,
		},
		{
			name:   "one season that the site lists",
			config: config.Config{Season: 2024},
			want:   []int{2024},
		},
		{
			name:        "one season that the site does not list yet",
			config:      config.Config{Season: 2026},
			wantSkipped: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			seasons, skipped := targetSeasons(test.config, listed)
			if skipped != test.wantSkipped {
				t.Fatalf("skipped is %v, want %v", skipped, test.wantSkipped)
			}
			if !slices.Equal(seasons, test.want) {
				t.Errorf("seasons are %v, want %v", seasons, test.want)
			}
		})
	}
}

func TestStatusFor(t *testing.T) {
	if got := statusFor(nil); got != store.RunSucceeded {
		t.Errorf("statusFor(nil) is %q, want %q", got, store.RunSucceeded)
	}
	if got := statusFor(errors.New("boom")); got != store.RunFailed {
		t.Errorf("statusFor(an error) is %q, want %q", got, store.RunFailed)
	}
}

func TestSeasonSummaryReportsEveryCount(t *testing.T) {
	result := pipeline.Summary{
		Season:              2001,
		Regions:             24,
		OHSAATeams:          700,
		OpponentsDiscovered: 60,
		OpponentsScraped:    60,
		GameRows:            6900,
		EmptyTeamPages:      1,
	}

	line, err := json.Marshal(seasonSummary("run-1", result, store.RunSucceeded))
	if err != nil {
		t.Fatalf("marshal the summary: %v", err)
	}

	want := `{"run_id":"run-1","season":2001,"regions":24,"ohsaa_teams":700,` +
		`"opponent_teams_discovered":60,"opponent_teams_scraped":60,"game_rows":6900,` +
		`"empty_team_pages":1,"status":"succeeded"}`
	if string(line) != want {
		t.Errorf("summary is %s, want %s", line, want)
	}
}

// A season with no empty page still reports the field, so a reader of the
// logs does not have to treat a missing field as zero.
func TestSeasonSummaryReportsZeroEmptyTeamPages(t *testing.T) {
	line, err := json.Marshal(seasonSummary("run-1", pipeline.Summary{Season: 2025}, store.RunSucceeded))
	if err != nil {
		t.Fatalf("marshal the summary: %v", err)
	}

	var fields map[string]any
	if err := json.Unmarshal(line, &fields); err != nil {
		t.Fatalf("unmarshal the summary: %v", err)
	}
	if value, ok := fields["empty_team_pages"]; !ok || value != float64(0) {
		t.Errorf("empty_team_pages is %v (present %v), want 0", value, ok)
	}
}
