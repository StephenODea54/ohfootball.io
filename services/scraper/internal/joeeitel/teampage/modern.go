package teampage

import (
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/StephenODea54/services/scraper/internal/joeeitel"
)

// modernParser reads the pages that hold a schedule table. The site has used
// this format since the 2013 season.
type modernParser struct{}

func (modernParser) Name() string { return "modern" }

func (modernParser) Matches(doc *goquery.Document) bool {
	return doc.Find("table.schedule").Length() > 0
}

func (modernParser) Parse(doc *goquery.Document, base *url.URL, ref joeeitel.TeamRef) (
	joeeitel.Team, []joeeitel.TeamScheduleRow, []joeeitel.TeamRef, error) {
	header := doc.Find("#header").First()
	details := joeeitel.LinesWithBreaks(header.Find("h3, h4").First())
	caption := doc.Find("table.schedule caption").First()
	captionLines := joeeitel.LinesWithBreaks(caption)
	metadata := strings.Join(append(slices.Clone(details), captionLines...), "\n")

	team := joeeitel.Team{
		Season: ref.Season,
		TeamID: ref.TeamID,
		Name:   schoolName(caption, ref),
	}
	team.Mascot = joeeitel.ParseMascot(team.Name, header.Find("h2").First().Text())
	team.City, team.State, team.County = joeeitel.ParseLocation(details)
	team.PrimaryColor, team.SecondaryColor = styleColors(header)
	team.Division, team.Region = joeeitel.ParseDivisionRegion(metadata)

	var rows []joeeitel.TeamScheduleRow
	opponents := make(map[string]joeeitel.TeamRef)
	doc.Find("table.schedule tbody tr").Each(func(_ int, row *goquery.Selection) {
		opponentCell := row.Find("td.opponent").First()
		if opponentCell.Length() == 0 {
			return
		}

		opponentLink := opponentCell.Find("a.teamLink, a[href*='teams.jsp']").First()
		opponentName := textWithoutClasses(opponentLink, "wltRecord", "playoff")
		if opponentName == "" {
			opponentName = joeeitel.CleanText(opponentCell.Text())
		}

		var opponent joeeitel.TeamRef
		if href, ok := opponentLink.Attr("href"); ok {
			opponent, _ = joeeitel.ParseTeamRef(base, href, ref.Season, opponentName)
			if opponent.TeamID != "" {
				opponents[opponent.Key()] = opponent
			}
		}

		playoff := ""
		if row.Find(".playoff").Length() > 0 {
			playoff = joeeitel.CleanText(row.Find(".playoff").First().Text())
		}
		rows = append(rows, joeeitel.TeamScheduleRow{
			Season:         ref.Season,
			SourceTeamID:   ref.TeamID,
			GameDate:       cellText(row, ".gameDate"),
			HomeAway:       cellText(row, ".homeAway"),
			OpponentTeamID: opponent.TeamID,
			Result:         cellText(row, ".result"),
			Score:          cellText(row, ".score"),
			Notes:          cellText(row, ".resultNote"),
			Playoff:        playoff,
		})
	})

	return team, rows, sortedRefs(opponents), nil
}

// schoolName reads the name out of the caption. The caption writes the year
// before or after the name, depending on the season.
func schoolName(caption *goquery.Selection, ref joeeitel.TeamRef) string {
	text := joeeitel.CleanText(caption.Text())
	year := strconv.Itoa(ref.Season)
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`(?i)^` + regexp.QuoteMeta(year) + `\s+(.+?)\s+Football\b`),
		regexp.MustCompile(`(?i)^(.+?)\s+` + regexp.QuoteMeta(year) + `\s+Football\b`),
	}
	for _, pattern := range patterns {
		if match := pattern.FindStringSubmatch(text); len(match) == 2 {
			return joeeitel.CleanText(match[1])
		}
	}
	return joeeitel.CleanText(ref.Name)
}

// styleColors reads the team colors out of a style attribute.
func styleColors(header *goquery.Selection) (primary, secondary string) {
	style, _ := header.Attr("style")
	for declaration := range strings.SplitSeq(style, ";") {
		property, value, ok := strings.Cut(declaration, ":")
		if !ok {
			continue
		}
		switch strings.ToLower(strings.TrimSpace(property)) {
		case "background-color":
			primary = strings.TrimSpace(value)
		case "color":
			secondary = strings.TrimSpace(value)
		}
	}
	return primary, secondary
}

func textWithoutClasses(selection *goquery.Selection, excluded ...string) string {
	if selection.Length() == 0 {
		return ""
	}
	clone := selection.Clone()
	for _, class := range excluded {
		clone.Find("." + class).Remove()
	}
	return joeeitel.CleanText(clone.Text())
}

func cellText(row *goquery.Selection, selector string) string {
	return joeeitel.CleanText(row.Find(selector).First().Text())
}

// sortedRefs turns the opponent set into a list in a stable order.
func sortedRefs(opponents map[string]joeeitel.TeamRef) []joeeitel.TeamRef {
	refs := make([]joeeitel.TeamRef, 0, len(opponents))
	for _, opponent := range opponents {
		refs = append(refs, opponent)
	}
	slices.SortFunc(refs, joeeitel.CompareTeamRefs)
	return refs
}
