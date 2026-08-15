package ohhsfbdb

import (
	"errors"

	"github.com/PuerkitoBio/goquery"
)

// ErrEmptyIndex reports an index sheet that names no school.
//
// This stops the run. The index always names schools, so an empty result means
// the page changed. Without this test the crawler would read nothing and still
// report success.
var ErrEmptyIndex = errors.New("the index sheet names no school")

// ParseIndex returns every school of the index sheet, in the order the sheet
// lists them.
//
// The sheet lays the schools out in a grid, and every name is a link to the
// sheet of that school. The link text is the only full name of a school that
// the workbook holds.
//
// Two entries may name one sheet, and the result keeps both. The index of the
// site holds one such pair, where a link is wrong. The raw layer records what
// the site says, and a later layer decides what to do about it.
func ParseIndex(doc *goquery.Document) ([]IndexEntry, error) {
	var entries []IndexEntry
	doc.Find("a[href]").Each(func(_ int, link *goquery.Selection) {
		href, _ := link.Attr("href")
		sheet, ok := sheetOf(href)
		if !ok || sheet == indexSheet {
			return
		}
		name := cleanText(link.Text())
		if name == "" {
			return
		}
		entries = append(entries, IndexEntry{Position: len(entries) + 1, Name: name, Sheet: sheet})
	})

	if len(entries) == 0 {
		return nil, ErrEmptyIndex
	}
	return entries, nil
}

// Sheets returns the sheets of the entries, without repeats, in the order they
// first appear.
//
// The crawler reads each sheet once. One sheet carries two names in the index,
// and reading it twice would store its games twice.
func Sheets(entries []IndexEntry) []string {
	seen := make(map[string]struct{}, len(entries))
	sheets := make([]string, 0, len(entries))
	for _, entry := range entries {
		if _, repeated := seen[entry.Sheet]; repeated {
			continue
		}
		seen[entry.Sheet] = struct{}{}
		sheets = append(sheets, entry.Sheet)
	}
	return sheets
}
