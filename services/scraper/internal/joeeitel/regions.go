package joeeitel

import (
	"fmt"
	"net/url"
	"slices"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

// ParseRegionLinks returns the address of every region page of one season, in
// order and without duplicates. An empty result means the season page holds no
// region link.
func ParseRegionLinks(doc *goquery.Document, base *url.URL, season int) []string {
	prefix := fmt.Sprintf("/hsfoot/rankings/%d/region-", season)
	seen := make(map[string]struct{})
	var regions []string

	doc.Find("a[href]").Each(func(_ int, link *goquery.Selection) {
		href, _ := link.Attr("href")
		resolved, err := resolveURL(base, href)
		if err != nil || !sameHost(base, resolved) || !strings.HasPrefix(resolved.Path, prefix) {
			return
		}
		canonicalHost(resolved)
		resolved.Fragment = ""

		canonical := resolved.String()
		if _, ok := seen[canonical]; ok {
			return
		}
		seen[canonical] = struct{}{}
		regions = append(regions, canonical)
	})

	slices.Sort(regions)
	return regions
}
