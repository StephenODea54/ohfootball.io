package joeeitel

import (
	"slices"
	"testing"
)

func TestParseTeamLinksReadsAModernRegionPage(t *testing.T) {
	doc, base := loadDocument(t, "region_modern.html",
		"https://joeeitel.com/hsfoot/rankings/2025/region-1")

	teams := ParseTeamLinks(doc, base, 2025)
	if len(teams) != 18 {
		t.Fatalf("got %d teams, want 18", len(teams))
	}
	for _, team := range teams {
		if team.Season != 2025 {
			t.Errorf("team %s has season %d, want 2025", team.TeamID, team.Season)
		}
		if team.TeamID == "" || team.Name == "" {
			t.Errorf("team reference is incomplete: %+v", team)
		}
	}
	if !slices.IsSortedFunc(teams, CompareTeamRefs) {
		t.Error("team references are not sorted")
	}
}

// The oldest region pages link a team without a year. The season of the run
// supplies it, so those references still name the right page.
func TestParseTeamLinksReadsALegacyRegionPage(t *testing.T) {
	doc, base := loadDocument(t, "region_legacy.html",
		"https://joeeitel.com/hsfoot/rankings/2002/region-1")

	teams := ParseTeamLinks(doc, base, 2002)
	if len(teams) != 28 {
		t.Fatalf("got %d teams, want 28", len(teams))
	}
	for _, team := range teams {
		if team.Season != 2002 {
			t.Errorf("team %s has season %d, want 2002", team.TeamID, team.Season)
		}
	}
	index := slices.IndexFunc(teams, func(ref TeamRef) bool { return ref.TeamID == "1346" })
	if index < 0 {
		t.Fatal("team 1346 is missing")
	}
	want := "https://joeeitel.com/hsfoot/teams.jsp?teamID=1346&year=2002"
	if teams[index].URL != want {
		t.Errorf("URL is %q, want %q", teams[index].URL, want)
	}
}

func TestParseTeamLinksHandlesHistoricalMarkupAndRemovesDuplicates(t *testing.T) {
	html := `<html><body><pre>
<a href="https://www.joeeitel.com/hsfoot/teams.jsp?year=2000&amp;teamID=1346">LAKEWOOD ST EDWARD</a>
<a href="https://joeeitel.com/hsfoot/teams.jsp?teamID=1346&amp;year=2000">duplicate</a>
</pre></body></html>`
	doc, base := documentFromString(t, html, "https://joeeitel.com/hsfoot/rankings/2000/region-1")

	teams := ParseTeamLinks(doc, base, 2000)
	if len(teams) != 1 {
		t.Fatalf("got %d teams, want 1", len(teams))
	}
	if teams[0].TeamID != "1346" || teams[0].Season != 2000 {
		t.Fatalf("unexpected team reference: %+v", teams[0])
	}
	if teams[0].URL != "https://joeeitel.com/hsfoot/teams.jsp?teamID=1346&year=2000" {
		t.Fatalf("unexpected canonical URL: %s", teams[0].URL)
	}
}

func TestParseTeamLinksReturnsNothingForAPageWithoutTeams(t *testing.T) {
	doc, base := documentFromString(t, `<html><body><a href="/hsfoot/">home</a></body></html>`,
		"https://joeeitel.com/hsfoot/rankings/2025/region-1")

	if teams := ParseTeamLinks(doc, base, 2025); len(teams) != 0 {
		t.Errorf("teams are %v, want none", teams)
	}
}
