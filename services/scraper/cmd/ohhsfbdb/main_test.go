package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"testing"

	"github.com/StephenODea54/services/scraper/internal/store"
)

func TestStatusFor(t *testing.T) {
	if got := statusFor(nil); got != store.RunSucceeded {
		t.Errorf("statusFor(nil) is %q, want %q", got, store.RunSucceeded)
	}
	if got := statusFor(errors.New("broken")); got != store.RunFailed {
		t.Errorf("statusFor(an error) is %q, want %q", got, store.RunFailed)
	}
}

func TestSummaryFieldNames(t *testing.T) {
	encoded, err := json.Marshal(summary{
		RunID: "abc", FirstSeason: 1972, LastSeason: 1999, IndexEntries: 818,
		Sheets: 817, SheetsWithNumber: 791, GameRows: 12, SummaryRows: 3,
		Status: string(store.RunSucceeded),
	})
	if err != nil {
		t.Fatalf("marshal the summary: %v", err)
	}

	var fields map[string]any
	if err := json.Unmarshal(encoded, &fields); err != nil {
		t.Fatalf("read the summary back: %v", err)
	}
	for _, name := range []string{
		"run_id", "first_season", "last_season", "index_entries",
		"sheets", "sheets_with_number", "game_rows", "summary_rows", "status",
	} {
		if _, ok := fields[name]; !ok {
			t.Errorf("the summary holds no field %q", name)
		}
	}
}

func TestPrintSummaryWritesOneLine(t *testing.T) {
	var out bytes.Buffer
	encoder := json.NewEncoder(&out)
	if err := encoder.Encode(summary{RunID: "abc", Status: "succeeded"}); err != nil {
		t.Fatalf("encode the summary: %v", err)
	}
	if bytes.Count(out.Bytes(), []byte("\n")) != 1 {
		t.Errorf("the summary is %q, want one line", out.String())
	}
}
