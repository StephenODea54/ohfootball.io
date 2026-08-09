package teampage

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/PuerkitoBio/goquery"
	"github.com/StephenODea54/services/scraper/internal/joeeitel"
)

func teamURL(teamID string, season int) string {
	return fmt.Sprintf("https://joeeitel.com/hsfoot/teams.jsp?teamID=%s&year=%d", teamID, season)
}

func documentFrom(t *testing.T, html, pageURL string) (*goquery.Document, *url.URL) {
	t.Helper()
	doc, base, err := joeeitel.NewDocument([]byte(html), pageURL)
	if err != nil {
		t.Fatalf("parse the page: %v", err)
	}
	return doc, base
}

func loadPage(t *testing.T, name, pageURL string) (*goquery.Document, *url.URL) {
	t.Helper()
	body, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("read %s: %v", name, err)
	}
	doc, base, err := joeeitel.NewDocument(body, pageURL)
	if err != nil {
		t.Fatalf("parse %s: %v", name, err)
	}
	return doc, base
}

// Every saved page must reach the parser of its own format. The registry tries
// the modern parser first, so a legacy page must not match it.
func TestRegistryPicksTheRightFormat(t *testing.T) {
	tests := []struct {
		file   string
		season int
		want   string
	}{
		{file: "team_modern.html", season: 2025, want: "modern"},
		{file: "team_modern_2013.html", season: 2013, want: "modern"},
		{file: "team_legacy_2008.html", season: 2008, want: "legacy"},
		{file: "team_legacy_2002.html", season: 2002, want: "legacy"},
	}

	for _, test := range tests {
		t.Run(test.file, func(t *testing.T) {
			doc, _ := loadPage(t, test.file, teamURL("1346", test.season))
			name, ok := MatchedBy(doc)
			if !ok {
				t.Fatal("no parser matched the page")
			}
			if name != test.want {
				t.Errorf("the %s parser matched, want %s", name, test.want)
			}
		})
	}
}

// A page in no known format stops the run, so a change to the site cannot pass
// as a team with no data.
func TestParseRejectsAnUnknownFormat(t *testing.T) {
	ref := joeeitel.TeamRef{Season: 2025, TeamID: "1", URL: teamURL("1", 2025)}
	doc, base := documentFrom(t, `<html><body><p>a new design</p></body></html>`, ref.URL)

	_, _, _, err := Parse(doc, base, ref)
	if !errors.Is(err, ErrUnknownFormat) {
		t.Fatalf("Parse returned %v, want ErrUnknownFormat", err)
	}
	if !strings.Contains(err.Error(), ref.URL) {
		t.Errorf("the error is %q, want it to name the page", err)
	}
}

func TestMatchedByReportsNothingForAnUnknownFormat(t *testing.T) {
	doc, _ := documentFrom(t, `<html><body><p>a new design</p></body></html>`, teamURL("1", 2025))
	if name, ok := MatchedBy(doc); ok {
		t.Errorf("the %s parser matched a page of no known format", name)
	}
}

// A legacy page whose header cell carries no bgcolor still matches through its
// font element.
func TestLegacyMatchesOnAFontElementAlone(t *testing.T) {
	doc, _ := documentFrom(t,
		`<html><body><table><tr><td><font size="+2">Ada Bulldogs</font></td></tr></table></body></html>`,
		teamURL("1", 2002))

	if name, ok := MatchedBy(doc); !ok || name != "legacy" {
		t.Errorf("the matcher returned %q and %v, want legacy and true", name, ok)
	}
}

func TestLegacyDoesNotMatchATableWithoutAHeaderCell(t *testing.T) {
	doc, _ := documentFrom(t, `<html><body><table></table></body></html>`, teamURL("1", 2002))
	if name, ok := MatchedBy(doc); ok {
		t.Errorf("the %s parser matched a table with no cell", name)
	}
}
