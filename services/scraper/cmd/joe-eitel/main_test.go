package main

import (
	"errors"
	"slices"
	"testing"

	"github.com/StephenODea54/services/scraper/internal/config"
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
