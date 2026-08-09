package joeeitel

import (
	"net/url"
	"slices"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

// ParseSeasons returns every season that the index page lists, in order and
// without duplicates. An empty result means the page holds no season link.
//
// The filter matters. The index page also holds links to single teams, and
// those carry a year as well. Without the path test each one would become a
// season that the site does not have.
//
// The path test is a suffix test, not an equality test. The season links are
// relative, so they resolve against whatever base the caller supplies. A
// suffix test gives the same answer for a base with a trailing slash and for a
// base without one.
func ParseSeasons(doc *goquery.Document, base *url.URL) []int {
	seen := make(map[int]struct{})
	var seasons []int

	doc.Find("a[href]").Each(func(_ int, link *goquery.Selection) {
		href, _ := link.Attr("href")
		resolved, err := resolveURL(base, href)
		if err != nil || !sameHost(base, resolved) || !strings.HasSuffix(resolved.Path, "/seasons.jsp") {
			return
		}
		season, err := strconv.Atoi(resolved.Query().Get("year"))
		if err != nil || season <= 0 {
			return
		}
		if _, ok := seen[season]; ok {
			return
		}
		seen[season] = struct{}{}
		seasons = append(seasons, season)
	})

	slices.Sort(seasons)
	return seasons
}
