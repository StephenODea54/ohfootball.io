package joeeitel

import (
	"slices"
	"strings"
	"testing"
)

func TestParseRegionLinksReadsTheSavedSeasonPage(t *testing.T) {
	doc, base := loadDocument(t, "season_page.html", SeasonURL("https://joeeitel.com", 2025))

	regions := ParseRegionLinks(doc, base, 2025)
	if len(regions) != 28 {
		t.Fatalf("got %d region links, want 28", len(regions))
	}
	if !slices.IsSorted(regions) {
		t.Errorf("region links are not sorted: %v", regions)
	}
	for _, region := range regions {
		if !strings.HasPrefix(region, "https://joeeitel.com/hsfoot/rankings/2025/region-") {
			t.Errorf("region link %q does not belong to season 2025", region)
		}
	}
}

func TestParseRegionLinksIgnoresOtherSeasonsAndOtherSites(t *testing.T) {
	html := `<html><body>
<a href="/hsfoot/rankings/2025/region-1">this season</a>
<a href="/hsfoot/rankings/2024/region-1">another season</a>
<a href="https://example.com/hsfoot/rankings/2025/region-9">another site</a>
<a href="/hsfoot/scoreboard/2025/week-1">another kind of page</a>
</body></html>`
	doc, base := documentFromString(t, html, SeasonURL("https://joeeitel.com", 2025))

	want := []string{"https://joeeitel.com/hsfoot/rankings/2025/region-1"}
	if regions := ParseRegionLinks(doc, base, 2025); !slices.Equal(regions, want) {
		t.Errorf("region links are %v, want %v", regions, want)
	}
}

// The same region appears with and without the www prefix, with either scheme,
// and with a fragment. All of those forms name one page.
func TestParseRegionLinksReducesEveryFormToOne(t *testing.T) {
	html := `<html><body>
<a href="https://joeeitel.com/hsfoot/rankings/2025/region-1">plain</a>
<a href="http://www.joeeitel.com/hsfoot/rankings/2025/region-1">www and http</a>
<a href="/hsfoot/rankings/2025/region-1#top">a fragment</a>
</body></html>`
	doc, base := documentFromString(t, html, SeasonURL("https://joeeitel.com", 2025))

	want := []string{"https://joeeitel.com/hsfoot/rankings/2025/region-1"}
	if regions := ParseRegionLinks(doc, base, 2025); !slices.Equal(regions, want) {
		t.Errorf("region links are %v, want %v", regions, want)
	}
}

func TestParseRegionLinksReturnsNothingForAPageWithoutRegions(t *testing.T) {
	doc, base := documentFromString(t, `<html><body><p>not yet</p></body></html>`,
		SeasonURL("https://joeeitel.com", 2026))

	if regions := ParseRegionLinks(doc, base, 2026); len(regions) != 0 {
		t.Errorf("region links are %v, want none", regions)
	}
}
