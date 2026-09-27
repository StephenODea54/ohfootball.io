package teampage

import (
	"context"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/StephenODea54/services/scraper/internal/fetch"
	"github.com/StephenODea54/services/scraper/internal/joeeitel"
)

// TestLiveSeasonFormats reads every team page of one season from the live site
// and checks that a registered parser matches each one.
//
// A page that matches no parser stops a real run, so the registry must cover
// every page of every season before it goes into service. The saved pages
// cover four pages, and one season covers about seven hundred.
//
// An empty page is not a format. A real run skips it, so this test counts it
// and does not fail.
//
// The test skips unless SCRAPER_LIVE_SEASON holds a season, so the offline
// suite and the pre-commit hook make no network request. Run it as:
//
//	SCRAPER_LIVE_SEASON=2002 go test ./internal/joeeitel/teampage/ -run Live -v -timeout 30m
//
// One season is about 28 region pages and about 700 team pages at three
// requests each second, which is more than five minutes.
func TestLiveSeasonFormats(t *testing.T) {
	raw := os.Getenv("SCRAPER_LIVE_SEASON")
	if raw == "" {
		t.Skip("SCRAPER_LIVE_SEASON is not set")
	}
	season, err := strconv.Atoi(raw)
	if err != nil {
		t.Fatalf("SCRAPER_LIVE_SEASON is not a number: %v", err)
	}

	const base = "https://joeeitel.com"
	client := fetch.New(fetch.Options{
		RequestsPerSecond: 3,
		Timeout:           20 * time.Second,
		MaxRetries:        3,
		UserAgent:         "ohfootball.io scraper/1.0 (+https://ohfootball.io)",
	})
	ctx := context.Background()

	seasonURL := joeeitel.SeasonURL(base, season)
	body, err := client.Get(ctx, seasonURL)
	if err != nil {
		t.Fatalf("read the page of season %d: %v", season, err)
	}
	doc, pageBase, err := joeeitel.NewDocument(body, seasonURL)
	if err != nil {
		t.Fatal(err)
	}

	regions := joeeitel.ParseRegionLinks(doc, pageBase, season)
	if len(regions) == 0 {
		t.Fatalf("the page of season %d lists no region", season)
	}
	t.Logf("season %d lists %d regions", season, len(regions))

	refs := make(map[string]joeeitel.TeamRef)
	for _, regionURL := range regions {
		body, err := client.Get(ctx, regionURL)
		if err != nil {
			t.Fatalf("read the region page %s: %v", regionURL, err)
		}
		doc, regionBase, err := joeeitel.NewDocument(body, regionURL)
		if err != nil {
			t.Fatal(err)
		}
		for _, ref := range joeeitel.ParseTeamLinks(doc, regionBase, season) {
			refs[ref.Key()] = ref
		}
	}
	t.Logf("season %d lists %d teams", season, len(refs))

	counts := make(map[string]int)
	var unmatched []string
	for _, ref := range refs {
		body, err := client.Get(ctx, ref.URL)
		if err != nil {
			t.Fatalf("read the team page %s: %v", ref.URL, err)
		}
		if joeeitel.IsEmptyPage(body) {
			counts["empty"]++
			t.Logf("the team page %s is empty", ref.URL)
			continue
		}
		doc, _, err := joeeitel.NewDocument(body, ref.URL)
		if err != nil {
			t.Fatal(err)
		}

		name, ok := MatchedBy(doc)
		if !ok {
			unmatched = append(unmatched, ref.URL)
			t.Errorf("no parser matches %s", ref.URL)
			continue
		}
		counts[name]++
	}

	t.Logf("season %d formats: %v", season, counts)
	if len(unmatched) > 0 {
		t.Fatalf("%d pages of season %d match no parser; save one of them as test data and correct the matcher",
			len(unmatched), season)
	}
}
