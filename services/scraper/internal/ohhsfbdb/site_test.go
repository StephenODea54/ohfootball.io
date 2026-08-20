package ohhsfbdb

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/PuerkitoBio/goquery"
)

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	body, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("read the fixture %s: %v", name, err)
	}
	return body
}

func fixtureDocument(t *testing.T, name string) *goquery.Document {
	t.Helper()
	doc, _, err := newDocument(fixture(t, name), "https://ohhsfbdb.net/TheTable.fld/"+name)
	if err != nil {
		t.Fatalf("parse the fixture %s: %v", name, err)
	}
	return doc
}

// document parses markup that a test wrote.
func document(t *testing.T, markup string) *goquery.Document {
	t.Helper()
	doc, _, err := newDocument([]byte(markup), "https://ohhsfbdb.net/TheTable.fld/sheet999.htm")
	if err != nil {
		t.Fatalf("parse the markup: %v", err)
	}
	return doc
}

func TestIndexURL(t *testing.T) {
	want := "https://ohhsfbdb.net/TheTable.fld/sheet001.htm"
	for _, base := range []string{"https://ohhsfbdb.net", "https://ohhsfbdb.net/"} {
		if got := IndexURL(base); got != want {
			t.Errorf("IndexURL(%q) is %q, want %q", base, got, want)
		}
	}
}

func TestSheetURL(t *testing.T) {
	got := SheetURL("https://ohhsfbdb.net/", "sheet175")
	want := "https://ohhsfbdb.net/TheTable.fld/sheet175.htm"
	if got != want {
		t.Errorf("SheetURL is %q, want %q", got, want)
	}
}

func TestSheetOf(t *testing.T) {
	tests := []struct {
		href string
		want string
		ok   bool
	}{
		{href: "sheet175.htm#RANGE!A1", want: "sheet175", ok: true},
		{href: "  sheet002.htm  ", want: "sheet002", ok: true},
		{href: "sheet001.htm", want: "sheet001", ok: true},
		{href: "../TheTable.htm", ok: false},
		{href: "stylesheet.css", ok: false},
		{href: "https://example.com/page.htm", ok: false},
		{href: "", ok: false},
		{href: "://not a url", ok: false},
	}

	for _, test := range tests {
		got, ok := sheetOf(test.href)
		if ok != test.ok || got != test.want {
			t.Errorf("sheetOf(%q) is (%q, %v), want (%q, %v)", test.href, got, ok, test.want, test.ok)
		}
	}
}

func TestCleanText(t *testing.T) {
	tests := map[string]string{
		"Ada":                "Ada",
		"Columbus\n  Grove":  "Columbus Grove",
		"  spaced   out  ":   "spaced out",
		" ":                  "",
		"":                   "",
		"Akron Garfield\n\t": "Akron Garfield",
	}
	for input, want := range tests {
		if got := cleanText(input); got != want {
			t.Errorf("cleanText(%q) is %q, want %q", input, got, want)
		}
	}
}

func TestNewDocumentRejectsAnInvalidPageURL(t *testing.T) {
	if _, _, err := newDocument([]byte("<html></html>"), "://no-scheme"); err == nil {
		t.Fatal("newDocument returned no error for an invalid page URL")
	}
}
