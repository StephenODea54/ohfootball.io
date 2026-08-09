// Package teampage reads one team page of joeeitel.com.
//
// The site has used two page formats. The modern format holds a table with the
// class schedule, and covers the seasons from 2013. The legacy format uses
// font elements, a bgcolor attribute, and cells in fixed positions, and covers
// the seasons from 2000 to 2012. Each format has its own file.
//
// To support a third format, add a file with a type that satisfies
// TeamPageParser, and add that type to the registry below. Nothing else
// changes.
package teampage

import (
	"errors"
	"fmt"
	"net/url"

	"github.com/PuerkitoBio/goquery"
	"github.com/StephenODea54/services/scraper/internal/joeeitel"
)

// TeamPageParser reads one format of team page.
type TeamPageParser interface {
	// Name identifies the format in an error or a log line.
	Name() string

	// Matches reports whether this parser can read the page.
	Matches(doc *goquery.Document) bool

	// Parse reads the page. The base resolves the relative links of the
	// schedule.
	Parse(doc *goquery.Document, base *url.URL, ref joeeitel.TeamRef) (
		joeeitel.Team, []joeeitel.TeamScheduleRow, []joeeitel.TeamRef, error)
}

// ErrUnknownFormat reports a team page that no parser recognises.
//
// This error stops the run. A page in no known format means the site changed,
// and a person must look at it. A crawler that carried on would store empty
// teams and report success.
var ErrUnknownFormat = errors.New("the team page matches no known format")

// parsers holds the formats in the order they are tried. The first match wins.
var parsers = []TeamPageParser{modernParser{}, legacyParser{}}

// Parse reads one team page with the first parser that matches it.
func Parse(doc *goquery.Document, base *url.URL, ref joeeitel.TeamRef) (
	joeeitel.Team, []joeeitel.TeamScheduleRow, []joeeitel.TeamRef, error) {
	for _, parser := range parsers {
		if parser.Matches(doc) {
			return parser.Parse(doc, base, ref)
		}
	}
	return joeeitel.Team{}, nil, nil, fmt.Errorf("%s: %w", ref.URL, ErrUnknownFormat)
}

// MatchedBy returns the name of the format that reads this page, and false
// when no parser matches. The live check uses it to report the formats of a
// whole season.
func MatchedBy(doc *goquery.Document) (string, bool) {
	for _, parser := range parsers {
		if parser.Matches(doc) {
			return parser.Name(), true
		}
	}
	return "", false
}
