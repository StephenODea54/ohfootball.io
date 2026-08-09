package teampage

import (
	"net/url"
	"regexp"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/StephenODea54/services/scraper/internal/joeeitel"
)

// gameDatePattern matches the date cell of a legacy schedule row. The legacy
// rows carry no class names, so the date tells a schedule row from any other
// row of the page.
var gameDatePattern = regexp.MustCompile(`^\d{1,2}/\d{1,2}$`)

// legacyParser reads the pages of the seasons from 2000 to 2012. Those pages
// hold no class names. The header is a table cell with a bgcolor attribute and
// a font element, and the schedule rows are cells in fixed positions.
type legacyParser struct{}

func (legacyParser) Name() string { return "legacy" }

func (legacyParser) Matches(doc *goquery.Document) bool {
	header := legacyHeader(doc)
	if header.Length() == 0 {
		return false
	}
	if _, hasColor := header.Attr("bgcolor"); hasColor {
		return true
	}
	return header.Find("font").Length() > 0
}

func (legacyParser) Parse(doc *goquery.Document, base *url.URL, ref joeeitel.TeamRef) (
	joeeitel.Team, []joeeitel.TeamScheduleRow, []joeeitel.TeamRef, error) {
	header := legacyHeader(doc)
	details := joeeitel.LinesWithBreaks(header)
	displayName := joeeitel.CleanText(header.Find("font").First().Text())

	team := joeeitel.Team{
		Season: ref.Season,
		TeamID: ref.TeamID,
		Name:   joeeitel.CleanText(ref.Name),
	}
	team.Mascot = joeeitel.ParseMascot(team.Name, displayName)
	team.City, team.State, team.County = joeeitel.ParseLocation(details)
	team.Division, team.Region = joeeitel.ParseDivisionRegion(strings.Join(details, "\n"))
	team.PrimaryColor, _ = header.Attr("bgcolor")
	team.SecondaryColor, _ = header.Find("font[color]").First().Attr("color")
	team.PrimaryColor = strings.TrimSpace(team.PrimaryColor)
	team.SecondaryColor = strings.TrimSpace(team.SecondaryColor)

	var rows []joeeitel.TeamScheduleRow
	opponents := make(map[string]joeeitel.TeamRef)
	doc.Find("tr").Each(func(_ int, row *goquery.Selection) {
		cells := row.ChildrenFiltered("td")
		if cells.Length() < 6 || !gameDatePattern.MatchString(joeeitel.CleanText(cells.Eq(0).Text())) {
			return
		}

		opponentLink := cells.Eq(2).Find("a[href*='teams.jsp']").First()
		var opponent joeeitel.TeamRef
		if href, ok := opponentLink.Attr("href"); ok {
			opponent, _ = joeeitel.ParseTeamRef(base, href, ref.Season, legacyOpponentName(opponentLink))
			if opponent.TeamID != "" {
				opponents[opponent.Key()] = opponent
			}
		}

		notes := ""
		if cells.Length() > 6 {
			notes = joeeitel.CleanText(cells.Eq(6).Text())
		}
		rows = append(rows, joeeitel.TeamScheduleRow{
			Season:         ref.Season,
			SourceTeamID:   ref.TeamID,
			GameDate:       joeeitel.CleanText(cells.Eq(0).Text()),
			HomeAway:       joeeitel.CleanText(cells.Eq(1).Text()),
			OpponentTeamID: opponent.TeamID,
			Result:         joeeitel.CleanText(cells.Eq(4).Text()),
			Score:          joeeitel.CleanText(cells.Eq(5).Text()),
			Notes:          notes,
			Playoff:        legacyPlayoff(opponentLink),
		})
	})

	return team, rows, sortedRefs(opponents), nil
}

// legacyHeader returns the cell that holds the school name and the location.
func legacyHeader(doc *goquery.Document) *goquery.Selection {
	return doc.Find("body > table").First().Find("td").First()
}

// legacyOpponentName drops the win and loss record, which the page writes in a
// font element inside the link.
func legacyOpponentName(link *goquery.Selection) string {
	if link.Length() == 0 {
		return ""
	}
	clone := link.Clone()
	clone.Find("font").Remove()
	return joeeitel.CleanText(clone.Text())
}

// legacyPlayoff reports a playoff game. The legacy pages mark one with a hash
// in one particular red.
func legacyPlayoff(link *goquery.Selection) string {
	playoff := ""
	link.Find("font[color]").EachWithBreak(func(_ int, font *goquery.Selection) bool {
		color, _ := font.Attr("color")
		if strings.EqualFold(strings.TrimSpace(color), "#ff0022") && strings.Contains(font.Text(), "#") {
			playoff = "#"
			return false
		}
		return true
	})
	return playoff
}
