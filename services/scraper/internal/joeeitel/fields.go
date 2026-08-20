package joeeitel

import (
	"regexp"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"golang.org/x/net/html"
)

var divisionPattern = regexp.MustCompile(`(?i)(?:OHSAA\s+)?Division\s+([IVXLC]+|\d+)(?:\s*,\s*Region\s+(\d+))?`)

// ParseMascot returns the part of the display name that follows the school
// name. The site writes the two together, as in "Ada Bulldogs". It returns an
// empty string when the display name does not begin with the school name.
func ParseMascot(name, displayName string) string {
	nameWords := strings.Fields(name)
	displayWords := strings.Fields(displayName)
	if len(nameWords) == 0 || len(displayWords) <= len(nameWords) {
		return ""
	}
	for index, word := range nameWords {
		if !strings.EqualFold(word, displayWords[index]) {
			return ""
		}
	}
	return strings.Join(displayWords[len(nameWords):], " ")
}

// ParseLocation reads the city, the state, and the county out of the lines of
// a page header. The county line ends with the word County. The city line
// holds one comma.
func ParseLocation(lines []string) (city, state, county string) {
	for _, line := range lines {
		if strings.HasSuffix(strings.ToLower(line), " county") {
			county = strings.TrimSpace(line[:len(line)-len(" County")])
			continue
		}
		parts := strings.Split(line, ",")
		if len(parts) == 2 && city == "" {
			city = CleanText(parts[0])
			state = CleanText(parts[1])
		}
	}
	return city, state, county
}

// ParseDivisionRegion reads the division and the region out of free text. The
// site writes the division in roman numerals on newer pages and in arabic
// numerals on older ones. The region is not always present.
func ParseDivisionRegion(text string) (division, region string) {
	match := divisionPattern.FindStringSubmatch(text)
	if len(match) != 3 {
		return "", ""
	}
	return CleanText(match[1]), CleanText(match[2])
}

// LinesWithBreaks returns the text of a selection, one line for each line
// break element. The site separates the city, the county, and the division
// with break elements rather than with separate blocks.
func LinesWithBreaks(selection *goquery.Selection) []string {
	if selection.Length() == 0 {
		return nil
	}
	var builder strings.Builder
	writeNodeText(&builder, selection.Get(0))

	rawLines := strings.Split(builder.String(), "\n")
	lines := make([]string, 0, len(rawLines))
	for _, line := range rawLines {
		if line = CleanText(line); line != "" {
			lines = append(lines, line)
		}
	}
	return lines
}

func writeNodeText(builder *strings.Builder, node *html.Node) {
	if node.Type == html.TextNode {
		builder.WriteString(node.Data)
	}
	if node.Type == html.ElementNode && node.Data == "br" {
		builder.WriteByte('\n')
	}
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		writeNodeText(builder, child)
	}
}

// CleanText collapses every run of whitespace into one space and removes the
// whitespace at both ends.
func CleanText(value string) string {
	return strings.Join(strings.Fields(value), " ")
}
