package config

import (
	"strings"
	"testing"
	"time"
)

// env turns a map into a getenv function, so a test never touches the process
// environment.
func env(values map[string]string) func(string) string {
	return func(name string) string { return values[name] }
}

func TestLoadAppliesTheDefaults(t *testing.T) {
	config, err := Load(env(map[string]string{
		"DATABASE_URL":   "postgres://localhost/test",
		"SCRAPER_SEASON": "2015",
	}))
	if err != nil {
		t.Fatalf("Load returned %v", err)
	}

	if config.BaseURL != "https://joeeitel.com" {
		t.Errorf("BaseURL is %q", config.BaseURL)
	}
	if config.Workers != 6 {
		t.Errorf("Workers is %d, want 6", config.Workers)
	}
	if config.RequestsPerSecond != 3 {
		t.Errorf("RequestsPerSecond is %v, want 3", config.RequestsPerSecond)
	}
	if config.RequestTimeout != 20*time.Second {
		t.Errorf("RequestTimeout is %v, want 20s", config.RequestTimeout)
	}
	if config.MaxRetries != 3 {
		t.Errorf("MaxRetries is %d, want 3", config.MaxRetries)
	}
	if config.UserAgent == "" {
		t.Error("UserAgent is empty")
	}
	if config.Season != 2015 || config.AllSeasons {
		t.Errorf("season selection is season=%d allSeasons=%v", config.Season, config.AllSeasons)
	}
}

func TestLoadReadsEveryOverride(t *testing.T) {
	config, err := Load(env(map[string]string{
		"DATABASE_URL":        "postgres://localhost/test",
		"SCRAPER_ALL_SEASONS": "true",
		"SCRAPER_BASE_URL":    "https://example.com",
		"SCRAPER_USER_AGENT":  "custom-agent",
		"SCRAPER_WORKERS":     "12",
		"SCRAPER_RATE":        "1.5",
		"SCRAPER_TIMEOUT":     "45s",
		"SCRAPER_RETRIES":     "0",
	}))
	if err != nil {
		t.Fatalf("Load returned %v", err)
	}

	if !config.AllSeasons || config.Season != 0 {
		t.Errorf("season selection is season=%d allSeasons=%v", config.Season, config.AllSeasons)
	}
	if config.BaseURL != "https://example.com" || config.UserAgent != "custom-agent" {
		t.Errorf("BaseURL is %q and UserAgent is %q", config.BaseURL, config.UserAgent)
	}
	if config.Workers != 12 || config.RequestsPerSecond != 1.5 {
		t.Errorf("Workers is %d and RequestsPerSecond is %v", config.Workers, config.RequestsPerSecond)
	}
	if config.RequestTimeout != 45*time.Second || config.MaxRetries != 0 {
		t.Errorf("RequestTimeout is %v and MaxRetries is %d", config.RequestTimeout, config.MaxRetries)
	}
}

func TestLoadRejectsBadInput(t *testing.T) {
	base := map[string]string{
		"DATABASE_URL":   "postgres://localhost/test",
		"SCRAPER_SEASON": "2015",
	}

	tests := []struct {
		name    string
		changes map[string]string
		want    string
	}{
		{
			name:    "no database URL",
			changes: map[string]string{"DATABASE_URL": ""},
			want:    "DATABASE_URL is required",
		},
		{
			name:    "no season selection",
			changes: map[string]string{"SCRAPER_SEASON": ""},
			want:    "set SCRAPER_SEASON or SCRAPER_ALL_SEASONS",
		},
		{
			name:    "both season selections",
			changes: map[string]string{"SCRAPER_ALL_SEASONS": "true"},
			want:    "but not both",
		},
		{
			name:    "all seasons is not a boolean",
			changes: map[string]string{"SCRAPER_SEASON": "", "SCRAPER_ALL_SEASONS": "yes please"},
			want:    "not true or false",
		},
		{
			name:    "all seasons is false",
			changes: map[string]string{"SCRAPER_SEASON": "", "SCRAPER_ALL_SEASONS": "false"},
			want:    "set SCRAPER_SEASON instead",
		},
		{
			name:    "season is not a number",
			changes: map[string]string{"SCRAPER_SEASON": "next year"},
			want:    "SCRAPER_SEASON is not a number",
		},
		{
			name:    "season is zero",
			changes: map[string]string{"SCRAPER_SEASON": "0"},
			want:    "SCRAPER_SEASON must be more than 0",
		},
		{
			name:    "season is negative",
			changes: map[string]string{"SCRAPER_SEASON": "-5"},
			want:    "SCRAPER_SEASON must be more than 0",
		},
		{
			name:    "base URL is not a URL",
			changes: map[string]string{"SCRAPER_BASE_URL": "not a url"},
			want:    "SCRAPER_BASE_URL is not a URL",
		},
		{
			name:    "workers is not a number",
			changes: map[string]string{"SCRAPER_WORKERS": "many"},
			want:    "SCRAPER_WORKERS is not a number",
		},
		{
			name:    "workers is zero",
			changes: map[string]string{"SCRAPER_WORKERS": "0"},
			want:    "SCRAPER_WORKERS must be at least 1",
		},
		{
			name:    "workers is negative",
			changes: map[string]string{"SCRAPER_WORKERS": "-2"},
			want:    "SCRAPER_WORKERS must be at least 1",
		},
		{
			name:    "rate is not a number",
			changes: map[string]string{"SCRAPER_RATE": "fast"},
			want:    "SCRAPER_RATE is not a number",
		},
		{
			name:    "rate is zero",
			changes: map[string]string{"SCRAPER_RATE": "0"},
			want:    "SCRAPER_RATE must be more than 0",
		},
		{
			name:    "rate is negative",
			changes: map[string]string{"SCRAPER_RATE": "-1"},
			want:    "SCRAPER_RATE must be more than 0",
		},
		{
			name:    "timeout is not a duration",
			changes: map[string]string{"SCRAPER_TIMEOUT": "soon"},
			want:    "SCRAPER_TIMEOUT is not a duration",
		},
		{
			name:    "timeout is zero",
			changes: map[string]string{"SCRAPER_TIMEOUT": "0s"},
			want:    "SCRAPER_TIMEOUT must be more than 0",
		},
		{
			name:    "timeout is negative",
			changes: map[string]string{"SCRAPER_TIMEOUT": "-1s"},
			want:    "SCRAPER_TIMEOUT must be more than 0",
		},
		{
			name:    "retries is not a number",
			changes: map[string]string{"SCRAPER_RETRIES": "a few"},
			want:    "SCRAPER_RETRIES is not a number",
		},
		{
			name:    "retries is negative",
			changes: map[string]string{"SCRAPER_RETRIES": "-1"},
			want:    "SCRAPER_RETRIES cannot be negative",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			values := make(map[string]string, len(base)+len(test.changes))
			for name, value := range base {
				values[name] = value
			}
			for name, value := range test.changes {
				values[name] = value
			}

			config, err := Load(env(values))
			if err == nil {
				t.Fatalf("Load returned no error, and gave %+v", config)
			}
			if !strings.Contains(err.Error(), test.want) {
				t.Errorf("error is %q, want it to contain %q", err, test.want)
			}
		})
	}
}
