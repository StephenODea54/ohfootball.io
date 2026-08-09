package joeeitel

import (
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

var gameDatePattern = regexp.MustCompile(`^\d{1,2}/\d{1,2}$`)

// ParseTeamPage reads one team page. It returns the team, the rows of its
// schedule, and the teams that the schedule links to. The base resolves the
// relative links of the schedule.
func ParseTeamPage(doc *goquery.Document, base *url.URL, ref TeamRef) (Team, []TeamScheduleRow, []TeamRef, error) {
	if doc.Find("table.schedule").Length() == 0 {
		return parseLegacyTeamPage(doc, base, ref)
	}

	header := doc.Find("#header").First()
	details := LinesWithBreaks(header.Find("h3, h4").First())
	caption := doc.Find("table.schedule caption").First()
	captionLines := LinesWithBreaks(caption)
	metadata := strings.Join(append(slices.Clone(details), captionLines...), "\n")

	team := Team{
		Season: ref.Season,
		TeamID: ref.TeamID,
		Name:   parseSchoolName(caption, ref),
	}
	team.Mascot = ParseMascot(team.Name, header.Find("h2").First().Text())
	team.City, team.State, team.County = ParseLocation(details)
	team.PrimaryColor, team.SecondaryColor = parseColors(header)
	team.Division, team.Region = ParseDivisionRegion(metadata)

	var games []TeamScheduleRow
	opponents := make(map[string]TeamRef)
	doc.Find("table.schedule tbody tr").Each(func(_ int, row *goquery.Selection) {
		opponentCell := row.Find("td.opponent").First()
		if opponentCell.Length() == 0 {
			return
		}

		opponentLink := opponentCell.Find("a.teamLink, a[href*='teams.jsp']").First()
		opponentName := textWithoutClasses(opponentLink, "wltRecord", "playoff")
		if opponentName == "" {
			opponentName = CleanText(opponentCell.Text())
		}

		var opponent TeamRef
		if href, ok := opponentLink.Attr("href"); ok {
			opponent, _ = ParseTeamRef(base, href, ref.Season, opponentName)
			if opponent.TeamID != "" {
				opponents[opponent.Key()] = opponent
			}
		}

		playoff := ""
		if row.Find(".playoff").Length() > 0 {
			playoff = CleanText(row.Find(".playoff").First().Text())
		}
		games = append(games, TeamScheduleRow{
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

	opponentRefs := make([]TeamRef, 0, len(opponents))
	for _, opponent := range opponents {
		opponentRefs = append(opponentRefs, opponent)
	}
	slices.SortFunc(opponentRefs, CompareTeamRefs)
	return team, games, opponentRefs, nil
}

func parseLegacyTeamPage(doc *goquery.Document, base *url.URL, ref TeamRef) (Team, []TeamScheduleRow, []TeamRef, error) {
	header := doc.Find("body > table").First().Find("td").First()
	details := LinesWithBreaks(header)
	displayName := CleanText(header.Find("font").First().Text())

	team := Team{Season: ref.Season, TeamID: ref.TeamID, Name: CleanText(ref.Name)}
	team.Mascot = ParseMascot(team.Name, displayName)
	team.City, team.State, team.County = ParseLocation(details)
	team.Division, team.Region = ParseDivisionRegion(strings.Join(details, "\n"))
	team.PrimaryColor, _ = header.Attr("bgcolor")
	team.SecondaryColor, _ = header.Find("font[color]").First().Attr("color")
	team.PrimaryColor = strings.TrimSpace(team.PrimaryColor)
	team.SecondaryColor = strings.TrimSpace(team.SecondaryColor)

	var games []TeamScheduleRow
	opponents := make(map[string]TeamRef)
	doc.Find("tr").Each(func(_ int, row *goquery.Selection) {
		cells := row.ChildrenFiltered("td")
		if cells.Length() < 6 || !gameDatePattern.MatchString(CleanText(cells.Eq(0).Text())) {
			return
		}

		opponentCell := cells.Eq(2)
		opponentLink := opponentCell.Find("a[href*='teams.jsp']").First()
		opponentName := legacyOpponentName(opponentLink)
		var opponent TeamRef
		if href, ok := opponentLink.Attr("href"); ok {
			opponent, _ = ParseTeamRef(base, href, ref.Season, opponentName)
			if opponent.TeamID != "" {
				opponents[opponent.Key()] = opponent
			}
		}

		playoff := ""
		opponentLink.Find("font[color]").EachWithBreak(func(_ int, font *goquery.Selection) bool {
			color, _ := font.Attr("color")
			if strings.EqualFold(strings.TrimSpace(color), "#ff0022") && strings.Contains(font.Text(), "#") {
				playoff = "#"
				return false
			}
			return true
		})

		notes := ""
		if cells.Length() > 6 {
			notes = CleanText(cells.Eq(6).Text())
		}
		games = append(games, TeamScheduleRow{
			Season:         ref.Season,
			SourceTeamID:   ref.TeamID,
			GameDate:       CleanText(cells.Eq(0).Text()),
			HomeAway:       CleanText(cells.Eq(1).Text()),
			OpponentTeamID: opponent.TeamID,
			Result:         CleanText(cells.Eq(4).Text()),
			Score:          CleanText(cells.Eq(5).Text()),
			Notes:          notes,
			Playoff:        playoff,
		})
	})

	opponentRefs := make([]TeamRef, 0, len(opponents))
	for _, opponent := range opponents {
		opponentRefs = append(opponentRefs, opponent)
	}
	slices.SortFunc(opponentRefs, CompareTeamRefs)
	return team, games, opponentRefs, nil
}

func legacyOpponentName(link *goquery.Selection) string {
	if link.Length() == 0 {
		return ""
	}
	clone := link.Clone()
	clone.Find("font").Remove()
	return CleanText(clone.Text())
}

func parseSchoolName(caption *goquery.Selection, ref TeamRef) string {
	text := CleanText(caption.Text())
	year := strconv.Itoa(ref.Season)
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`(?i)^` + regexp.QuoteMeta(year) + `\s+(.+?)\s+Football\b`),
		regexp.MustCompile(`(?i)^(.+?)\s+` + regexp.QuoteMeta(year) + `\s+Football\b`),
	}
	for _, pattern := range patterns {
		if match := pattern.FindStringSubmatch(text); len(match) == 2 {
			return CleanText(match[1])
		}
	}
	return CleanText(ref.Name)
}

func parseColors(header *goquery.Selection) (primary, secondary string) {
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
	return CleanText(clone.Text())
}

func cellText(row *goquery.Selection, selector string) string {
	return CleanText(row.Find(selector).First().Text())
}

func teamKey(season int, teamID string) string {
	return strconv.Itoa(season) + ":" + teamID
}
