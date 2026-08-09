package joeeitel

import (
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/PuerkitoBio/goquery"
)

// loadDocument reads a saved page and returns it with the base address it was
// served from. The tests make no network request.
func loadDocument(t *testing.T, name, pageURL string) (*goquery.Document, *url.URL) {
	t.Helper()
	body, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("read %s: %v", name, err)
	}
	doc, base, err := NewDocument(body, pageURL)
	if err != nil {
		t.Fatalf("parse %s: %v", name, err)
	}
	return doc, base
}

func documentFromString(t *testing.T, html, pageURL string) (*goquery.Document, *url.URL) {
	t.Helper()
	doc, base, err := NewDocument([]byte(html), pageURL)
	if err != nil {
		t.Fatalf("parse the page: %v", err)
	}
	return doc, base
}

func TestParseSeasonsReadsTheSavedIndexPage(t *testing.T) {
	doc, base := loadDocument(t, "season_index.html", SeasonIndexURL("https://joeeitel.com"))

	seasons := ParseSeasons(doc, base)
	if len(seasons) != 27 {
		t.Fatalf("got %d seasons, want 27", len(seasons))
	}
	if !slices.IsSorted(seasons) {
		t.Errorf("seasons are not sorted: %v", seasons)
	}
	if seasons[0] != 2000 {
		t.Errorf("the first season is %d, want 2000", seasons[0])
	}
	if seasons[len(seasons)-1] != 2026 {
		t.Errorf("the last season is %d, want 2026", seasons[len(seasons)-1])
	}
	if len(slices.Compact(slices.Clone(seasons))) != len(seasons) {
		t.Errorf("seasons hold a duplicate: %v", seasons)
	}
}

// The index page also links single teams, and those links carry a year. The
// path filter keeps them out of the season list.
func TestParseSeasonsIgnoresLinksThatAreNotSeasonLinks(t *testing.T) {
	html := `<html><body>
<a href="seasons.jsp?year=2014">2014</a>
<a href="teams.jsp?teamID=483&amp;year=1998">a team</a>
<a href="https://example.com/hsfoot/seasons.jsp?year=1997">another site</a>
<a href="seasons.jsp?year=0">zero</a>
<a href="seasons.jsp?year=-5">negative</a>
<a href="seasons.jsp?year=soon">not a number</a>
<a href="seasons.jsp">no year</a>
</body></html>`
	doc, base := documentFromString(t, html, SeasonIndexURL("https://joeeitel.com"))

	seasons := ParseSeasons(doc, base)
	if !slices.Equal(seasons, []int{2014}) {
		t.Errorf("seasons are %v, want [2014]", seasons)
	}
}

func TestParseSeasonsRemovesDuplicates(t *testing.T) {
	html := `<html><body>
<a href="seasons.jsp?year=2014">2014</a>
<a href="https://www.joeeitel.com/hsfoot/seasons.jsp?year=2014">the same season</a>
</body></html>`
	doc, base := documentFromString(t, html, SeasonIndexURL("https://joeeitel.com"))

	if seasons := ParseSeasons(doc, base); !slices.Equal(seasons, []int{2014}) {
		t.Errorf("seasons are %v, want [2014]", seasons)
	}
}

func TestParseSeasonsReturnsNothingForAPageWithoutSeasonLinks(t *testing.T) {
	doc, base := documentFromString(t, `<html><body><p>no links</p></body></html>`,
		SeasonIndexURL("https://joeeitel.com"))

	if seasons := ParseSeasons(doc, base); len(seasons) != 0 {
		t.Errorf("seasons are %v, want none", seasons)
	}
}
