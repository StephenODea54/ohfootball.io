package ohhsfbdb

import (
	"errors"
	"slices"
	"testing"
)

func TestParseIndexReadsTheSavedIndex(t *testing.T) {
	entries, err := ParseIndex(fixtureDocument(t, "index.htm"))
	if err != nil {
		t.Fatalf("ParseIndex returned %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("ParseIndex returned no entry")
	}

	sheets := make(map[string][]string)
	for _, entry := range entries {
		sheets[entry.Name] = append(sheets[entry.Name], entry.Sheet)
	}

	// A name that breaks across lines in the markup reads as one line.
	if got := sheets["Columbus Academy"]; len(got) != 1 {
		t.Errorf("the entry for Columbus Academy is %v, want one sheet", got)
	}

	// Both names of the school that changed its name are present, and they
	// name different sheets.
	older, newer := sheets["Akron Garfield (-2016)"], sheets["Akr. Garfield (2017-)"]
	if len(older) != 1 || len(newer) != 1 {
		t.Fatalf("the Garfield entries are %v and %v, want one sheet each", older, newer)
	}
	if older[0] == newer[0] {
		t.Errorf("both Garfield names point at %s, want different sheets", older[0])
	}

	// The site links two names to one sheet. The result keeps both.
	fairview, roosevelt := sheets["Dayton Fairview"], sheets["Dayton Roosevelt"]
	if len(fairview) != 1 || len(roosevelt) != 1 {
		t.Fatalf("the Dayton entries are %v and %v, want one sheet each", fairview, roosevelt)
	}
	if fairview[0] != roosevelt[0] {
		t.Errorf("the Dayton names point at %s and %s, want one sheet", fairview[0], roosevelt[0])
	}
}

func TestParseIndexNumbersTheEntriesInOrder(t *testing.T) {
	entries, err := ParseIndex(fixtureDocument(t, "index.htm"))
	if err != nil {
		t.Fatalf("ParseIndex returned %v", err)
	}
	for number, entry := range entries {
		if entry.Position != number+1 {
			t.Fatalf("entry %d holds position %d", number, entry.Position)
		}
	}
}

func TestParseIndexIgnoresLinksThatNameNoSheet(t *testing.T) {
	entries, err := ParseIndex(document(t, `<table><tr>
		<td><a href="../TheTable.htm">Back</a></td>
		<td><a href="sheet002.htm#RANGE!A1">Ada</a></td>
		<td><a href="sheet001.htm">Main Table</a></td>
		<td><a href="sheet003.htm"> </a></td>
	</tr></table>`))
	if err != nil {
		t.Fatalf("ParseIndex returned %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("ParseIndex returned %d entries, want 1: %+v", len(entries), entries)
	}
	if entries[0].Name != "Ada" || entries[0].Sheet != "sheet002" {
		t.Errorf("the entry is %+v", entries[0])
	}
}

func TestParseIndexRejectsAnIndexWithNoSchool(t *testing.T) {
	_, err := ParseIndex(document(t, `<table><tr><td>nothing here</td></tr></table>`))
	if !errors.Is(err, ErrEmptyIndex) {
		t.Fatalf("ParseIndex returned %v, want ErrEmptyIndex", err)
	}
}

func TestSheetsDropsRepeats(t *testing.T) {
	entries := []IndexEntry{
		{Position: 1, Name: "Dayton Fairview", Sheet: "sheet739"},
		{Position: 2, Name: "Ada", Sheet: "sheet002"},
		{Position: 3, Name: "Dayton Roosevelt", Sheet: "sheet739"},
	}
	want := []string{"sheet739", "sheet002"}
	if got := Sheets(entries); !slices.Equal(got, want) {
		t.Errorf("Sheets returned %v, want %v", got, want)
	}
}
