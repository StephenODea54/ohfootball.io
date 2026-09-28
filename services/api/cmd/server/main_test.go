package main

import (
	"strings"
	"testing"

	"github.com/StephenODea54/services/api/internal/ratelimit"
	"github.com/StephenODea54/services/api/internal/server"
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

func TestReadFieldLimit(t *testing.T) {
	if limit, err := readFieldLimit(); err != nil || limit != server.DefaultFieldLimit {
		t.Fatalf("readFieldLimit = %d, %v, want the default %d", limit, err, server.DefaultFieldLimit)
	}
	t.Setenv("GRAPHQL_FIELD_LIMIT", "250")
	if limit, err := readFieldLimit(); err != nil || limit != 250 {
		t.Fatalf("readFieldLimit = %d, %v, want 250", limit, err)
	}
}

func TestReadFieldLimitRefusesBadValues(t *testing.T) {
	for value, want := range map[string]string{"0": "at least 1", "-5": "at least 1", "many": "whole number"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("GRAPHQL_FIELD_LIMIT", value)
			_, err := readFieldLimit()
			if err == nil || !strings.Contains(err.Error(), "GRAPHQL_FIELD_LIMIT") || !strings.Contains(err.Error(), want) {
				t.Fatalf("error = %v, want one that names GRAPHQL_FIELD_LIMIT and says %q", err, want)
			}
		})
	}
}
