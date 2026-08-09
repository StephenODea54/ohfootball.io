package joeeitel

import (
	"slices"
	"strings"
	"testing"

	"github.com/PuerkitoBio/goquery"
)

func selectionFrom(t *testing.T, html, selector string) *goquery.Selection {
	t.Helper()
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		t.Fatalf("parse the page: %v", err)
	}
	return doc.Find(selector).First()
}

func TestParseMascot(t *testing.T) {
	tests := []struct {
		name        string
		displayName string
		want        string
	}{
		{name: "Ada", displayName: "Ada Bulldogs", want: "Bulldogs"},
		{name: "Perrysburg", displayName: "Perrysburg Yellow Jackets", want: "Yellow Jackets"},
		{name: "LAKEWOOD ST EDWARD", displayName: "Lakewood St Edward Eagles", want: "Eagles"},
		{name: "Ada", displayName: "Ada", want: ""},
		{name: "Ada", displayName: "Adams County Mustangs", want: ""},
		{name: "", displayName: "Ada Bulldogs", want: ""},
	}

	for _, test := range tests {
		t.Run(test.displayName, func(t *testing.T) {
			if got := ParseMascot(test.name, test.displayName); got != test.want {
				t.Fatalf("ParseMascot(%q, %q) = %q, want %q", test.name, test.displayName, got, test.want)
			}
		})
	}
}

func TestParseLocation(t *testing.T) {
	tests := []struct {
		name       string
		lines      []string
		city       string
		state      string
		county     string
		wantNoCity bool
	}{
		{
			name:   "city and county",
			lines:  []string{"Lakewood, OH", "Cuyahoga County"},
			city:   "Lakewood",
			state:  "OH",
			county: "Cuyahoga",
		},
		{
			name:  "no county line",
			lines: []string{"Ada, OH"},
			city:  "Ada",
			state: "OH",
		},
		{
			name:   "the first city line wins",
			lines:  []string{"Ada, OH", "Somewhere, PA"},
			city:   "Ada",
			state:  "OH",
			county: "",
		},
		{
			name:  "no location at all",
			lines: []string{"Coach: Tom Lombardo"},
		},
		{
			name:  "extra commas are not a city",
			lines: []string{"one, two, three"},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			city, state, county := ParseLocation(test.lines)
			if city != test.city || state != test.state || county != test.county {
				t.Errorf("ParseLocation(%v) = %q, %q, %q; want %q, %q, %q",
					test.lines, city, state, county, test.city, test.state, test.county)
			}
		})
	}
}

func TestParseDivisionRegion(t *testing.T) {
	tests := []struct {
		text     string
		division string
		region   string
	}{
		{text: "Division I, Region 1", division: "I", region: "1"},
		{text: "OHSAA Division 1, Region 4", division: "1", region: "4"},
		{text: "division vii, region 28", division: "vii", region: "28"},
		{text: "Division III", division: "III", region: ""},
		{text: "no division here", division: "", region: ""},
	}

	for _, test := range tests {
		t.Run(test.text, func(t *testing.T) {
			division, region := ParseDivisionRegion(test.text)
			if division != test.division || region != test.region {
				t.Errorf("ParseDivisionRegion(%q) = %q, %q; want %q, %q",
					test.text, division, region, test.division, test.region)
			}
		})
	}
}

func TestLinesWithBreaks(t *testing.T) {
	selection := selectionFrom(t,
		`<div id="header"><h4><br>Lakewood, OH<br>  Cuyahoga County  <br><br>Division I</h4></div>`, "h4")

	want := []string{"Lakewood, OH", "Cuyahoga County", "Division I"}
	if lines := LinesWithBreaks(selection); !slices.Equal(lines, want) {
		t.Errorf("LinesWithBreaks returned %v, want %v", lines, want)
	}
}

func TestLinesWithBreaksReturnsNothingForAnEmptySelection(t *testing.T) {
	selection := selectionFrom(t, `<div></div>`, "h4")
	if lines := LinesWithBreaks(selection); lines != nil {
		t.Errorf("LinesWithBreaks returned %v, want nil", lines)
	}
}

func TestCleanText(t *testing.T) {
	tests := []struct{ in, want string }{
		{in: "  Massillon\n Washington  ", want: "Massillon Washington"},
		{in: "\t\n  ", want: ""},
		{in: "", want: ""},
		{in: "one", want: "one"},
	}
	for _, test := range tests {
		if got := CleanText(test.in); got != test.want {
			t.Errorf("CleanText(%q) = %q, want %q", test.in, got, test.want)
		}
	}
}
