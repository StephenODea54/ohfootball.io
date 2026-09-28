package main

import (
	"strings"
	"testing"

	"github.com/StephenODea54/services/api/internal/ratelimit"
)

func TestReadLimitsDefaults(t *testing.T) {
	limits, err := readLimits()
	if err != nil {
		t.Fatalf("readLimits: %v", err)
	}
	if limits != ratelimit.DefaultLimits() {
		t.Fatalf("limits = %+v, want the defaults %+v", limits, ratelimit.DefaultLimits())
	}
}

func TestReadLimitsFromTheEnvironment(t *testing.T) {
	t.Setenv("RATE_LIMIT_ADDRESS_PER_MINUTE", "120")
	t.Setenv("RATE_LIMIT_ADDRESS_BURST", "10")
	t.Setenv("RATE_LIMIT_TOTAL_PER_SECOND", "5")
	t.Setenv("RATE_LIMIT_TOTAL_BURST", "10")

	limits, err := readLimits()
	if err != nil {
		t.Fatalf("readLimits: %v", err)
	}
	want := ratelimit.Limits{
		PerAddress: ratelimit.Rate{PerSecond: 2, Burst: 10},
		Total:      ratelimit.Rate{PerSecond: 5, Burst: 10},
	}
	if limits != want {
		t.Fatalf("limits = %+v, want %+v", limits, want)
	}
}

// With a larger burst, one address could empty the total bucket and lock out every caller.
func TestReadLimitsRefusesAnAddressBurstOverTheTotalBurst(t *testing.T) {
	t.Setenv("RATE_LIMIT_ADDRESS_BURST", "41")

	_, err := readLimits()
	if err == nil || !strings.Contains(err.Error(), "RATE_LIMIT_ADDRESS_BURST") || !strings.Contains(err.Error(), "RATE_LIMIT_TOTAL_BURST") {
		t.Fatalf("error = %v, want one that names both bursts", err)
	}
}

func TestReadLimitsAcceptsEqualBursts(t *testing.T) {
	t.Setenv("RATE_LIMIT_ADDRESS_BURST", "40")

	if _, err := readLimits(); err != nil {
		t.Fatalf("readLimits: %v", err)
	}
}

func TestReadLimitsRefusesBadValues(t *testing.T) {
	cases := []struct{ name, value, want string }{
		{"RATE_LIMIT_ADDRESS_PER_MINUTE", "0", "at least 1"},
		{"RATE_LIMIT_ADDRESS_BURST", "-1", "at least 1"},
		{"RATE_LIMIT_TOTAL_PER_SECOND", "2.5", "whole number"},
		{"RATE_LIMIT_TOTAL_BURST", "many", "whole number"},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Setenv(testCase.name, testCase.value)
			_, err := readLimits()
			if err == nil || !strings.Contains(err.Error(), testCase.name) || !strings.Contains(err.Error(), testCase.want) {
				t.Fatalf("error = %v, want one that names %s and says %q", err, testCase.name, testCase.want)
			}
		})
	}
}
