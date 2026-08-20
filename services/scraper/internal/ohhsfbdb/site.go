// Package ohhsfbdb reads the season records of ohhsfbdb.net.
//
// The pages are the output of a spreadsheet program, saved as web pages. The
// address TheTable.htm holds no data. It names the sheets of one workbook, and
// each sheet is a separate page under TheTable.fld. Sheet one is an index of
// every school, and each other sheet holds the whole history of one school.
//
// Every sheet uses one layout, so this package holds one parser. That differs
// from the joeeitel package, which needs a registry because that site really
// has more than one format. The header check in ParseSheet stops the run if
// the workbook is ever saved in another shape.
package ohhsfbdb

import (
	"bytes"
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

// indexSheet is the sheet that lists every school.
const indexSheet = "sheet001"

// sheetPattern matches the file name of a sheet, so a link to another sheet
// becomes a name that the crawler can queue.
var sheetPattern = regexp.MustCompile(`^(sheet\d+)\.htm$`)

// IndexURL returns the address of the index sheet.
func IndexURL(base string) string {
	return SheetURL(base, indexSheet)
}

// SheetURL returns the address of one sheet.
func SheetURL(base, sheet string) string {
	return fmt.Sprintf("%s/TheTable.fld/%s.htm", strings.TrimRight(base, "/"), sheet)
}

// newDocument parses a page body and returns the document with the base
// address that resolves its relative links.
func newDocument(body []byte, pageURL string) (*goquery.Document, *url.URL, error) {
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

// sheetOf returns the sheet that a link points to. The second result is false
// when the link points elsewhere.
//
// The links inside the workbook are relative and carry a fragment, as in
// "sheet175.htm#RANGE!A1". Only the file name matters.
func sheetOf(href string) (string, bool) {
	parsed, err := url.Parse(strings.TrimSpace(href))
	if err != nil {
		return "", false
	}
	match := sheetPattern.FindStringSubmatch(parsed.Path)
	if match == nil {
		return "", false
	}
	return match[1], true
}

// cleanText reduces the text of one cell to a single line.
//
// A name breaks across lines in the markup, and an empty cell holds a no-break
// space. strings.Fields treats both as space, so this returns the words of the
// cell joined by one space, and returns an empty string for an empty cell.
func cleanText(value string) string {
	return strings.Join(strings.Fields(value), " ")
}
