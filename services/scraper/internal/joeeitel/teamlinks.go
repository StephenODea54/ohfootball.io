package joeeitel

import (
	"net/url"
	"slices"

	"github.com/PuerkitoBio/goquery"
)

// ParseTeamLinks returns the teams that a region page links to, in order and
// without duplicates. An empty result means the page holds no team link.
//
// Region pages of different years use different markup. The modern pages hold
// a table, and the oldest pages hold a preformatted block. Both use the same
// kind of link, so one function reads both.
func ParseTeamLinks(doc *goquery.Document, base *url.URL, season int) []TeamRef {
	seen := make(map[string]struct{})
	var teams []TeamRef

	doc.Find("a[href]").Each(func(_ int, link *goquery.Selection) {
		href, _ := link.Attr("href")
		ref, ok := ParseTeamRef(base, href, season, CleanText(link.Text()))
		if !ok {
			return
		}
		if _, exists := seen[ref.Key()]; exists {
			return
		}
		seen[ref.Key()] = struct{}{}
		teams = append(teams, ref)
	})

	slices.SortFunc(teams, compareTeamRefs)
	return teams
}
