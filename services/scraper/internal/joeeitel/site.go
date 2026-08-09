package joeeitel

import (
	"bytes"
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

// host is the canonical host of the site. Links appear with and without the
// www prefix, and with both schemes. Duplicate detection compares URL strings,
// so every link must be reduced to one form before comparison.
const host = "joeeitel.com"

// SeasonIndexURL returns the address of the page that lists every season.
//
// The trailing slash is necessary. The site answers /hsfoot with a redirect to
// /hsfoot/, and the season links on that page are relative, in the form
// href="seasons.jsp?year=2000". A base without the trailing slash resolves
// those links to /seasons.jsp and drops the /hsfoot prefix.
func SeasonIndexURL(base string) string {
	return strings.TrimRight(base, "/") + "/hsfoot/"
}

// SeasonURL returns the address of the page for one season.
func SeasonURL(base string, season int) string {
	return fmt.Sprintf("%s/hsfoot/seasons.jsp?year=%d", strings.TrimRight(base, "/"), season)
}

// NewDocument parses a page body and returns the document with the base
// address that resolves its relative links. Every parser in this package needs
// both, because a parsed document does not hold the address it came from.
func NewDocument(body []byte, pageURL string) (*goquery.Document, *url.URL, error) {
	doc, err := goquery.NewDocumentFromReader(bytes.NewReader(body))
	if err != nil {
		return nil, nil, fmt.Errorf("parse %s: %w", pageURL, err)
	}
	base, err := url.Parse(pageURL)
	if err != nil {
		return nil, nil, fmt.Errorf("parse page URL %s: %w", pageURL, err)
	}
	return doc, base, nil
}

// ParseTeamRef reads one link and returns the team it points to. The second
// result is false when the link is not a team link.
//
// The season comes from the caller, not from the link. The site sometimes
// links a team with a year other than the year of the page that holds the
// link. The run scrapes one season, so the reference and the URL that it
// builds both carry the season of the run.
func ParseTeamRef(base *url.URL, href string, season int, name string) (TeamRef, bool) {
	resolved, err := resolveURL(base, href)
	if err != nil || !sameHost(base, resolved) || !strings.HasSuffix(resolved.Path, "/teams.jsp") {
		return TeamRef{}, false
	}

	teamID := resolved.Query().Get("teamID")
	if teamID == "" {
		return TeamRef{}, false
	}

	canonicalHost(resolved)
	resolved.Path = "/hsfoot/teams.jsp"
	resolved.RawQuery = url.Values{"teamID": {teamID}, "year": {strconv.Itoa(season)}}.Encode()
	resolved.Fragment = ""
	return TeamRef{Season: season, TeamID: teamID, Name: CleanText(name), URL: resolved.String()}, true
}

// canonicalHost reduces a URL on this site to one scheme and one host, so that
// two links to the same page compare equal.
func canonicalHost(u *url.URL) {
	if strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.") != host {
		return
	}
	u.Scheme = "https"
	u.Host = host
}

func resolveURL(base *url.URL, href string) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(href))
	if err != nil {
		return nil, err
	}
	return base.ResolveReference(parsed), nil
}

func sameHost(a, b *url.URL) bool {
	aHost := strings.TrimPrefix(strings.ToLower(a.Hostname()), "www.")
	bHost := strings.TrimPrefix(strings.ToLower(b.Hostname()), "www.")
	return aHost != "" && aHost == bHost
}
