package joeeitel

import (
	"fmt"
	"io"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"golang.org/x/net/html"
)

var (
	divisionPattern = regexp.MustCompile(`(?i)(?:OHSAA\s+)?Division\s+([IVXLC]+|\d+)(?:\s*,\s*Region\s+(\d+))?`)
	gameDatePattern = regexp.MustCompile(`^\d{1,2}/\d{1,2}$`)
)

func parseLatestSeason(r io.Reader, pageURL string) (int, error) {
	doc, err := goquery.NewDocumentFromReader(r)
	if err != nil {
		return 0, fmt.Errorf("parse season index: %w", err)
	}

	base, err := url.Parse(pageURL)
	if err != nil {
		return 0, fmt.Errorf("parse season index URL: %w", err)
	}

	latest := 0
	doc.Find("a[href]").Each(func(_ int, link *goquery.Selection) {
		href, _ := link.Attr("href")
		resolved, resolveErr := resolveURL(base, href)
		if resolveErr != nil {
			return
		}
		year, parseErr := strconv.Atoi(resolved.Query().Get("year"))
		if parseErr == nil && year > latest {
			latest = year
		}
	})

	if latest == 0 {
		return 0, fmt.Errorf("season index did not contain a year link")
	}
	return latest, nil
}

func parseRegionURLs(r io.Reader, pageURL string, season int) ([]string, error) {
	doc, err := goquery.NewDocumentFromReader(r)
	if err != nil {
		return nil, fmt.Errorf("parse season page: %w", err)
	}
	base, err := url.Parse(pageURL)
	if err != nil {
		return nil, fmt.Errorf("parse season page URL: %w", err)
	}

	prefix := fmt.Sprintf("/hsfoot/rankings/%d/region-", season)
	seen := make(map[string]struct{})
	var regions []string
	doc.Find("a[href]").Each(func(_ int, link *goquery.Selection) {
		href, _ := link.Attr("href")
		resolved, resolveErr := resolveURL(base, href)
		if resolveErr != nil || !sameHost(base, resolved) || !strings.HasPrefix(resolved.Path, prefix) {
			return
		}
		canonicalHost(resolved)
		resolved.Fragment = ""
		canonical := resolved.String()
		if _, ok := seen[canonical]; ok {
			return
		}
		seen[canonical] = struct{}{}
		regions = append(regions, canonical)
	})

	slices.Sort(regions)
	if len(regions) == 0 {
		return nil, fmt.Errorf("season %d page did not contain region links", season)
	}
	return regions, nil
}

func parseRegionTeams(r io.Reader, pageURL string, season int) ([]TeamRef, error) {
	doc, err := goquery.NewDocumentFromReader(r)
	if err != nil {
		return nil, fmt.Errorf("parse region page: %w", err)
	}
	base, err := url.Parse(pageURL)
	if err != nil {
		return nil, fmt.Errorf("parse region page URL: %w", err)
	}

	seen := make(map[string]struct{})
	var teams []TeamRef
	doc.Find("a[href]").Each(func(_ int, link *goquery.Selection) {
		href, _ := link.Attr("href")
		ref, ok := ParseTeamRef(base, href, season, cleanText(link.Text()))
		if !ok {
			return
		}
		if _, ok := seen[ref.Key()]; ok {
			return
		}
		seen[ref.Key()] = struct{}{}
		teams = append(teams, ref)
	})

	if len(teams) == 0 {
		return nil, fmt.Errorf("region page did not contain team links: %s", pageURL)
	}
	return teams, nil
}

func parseTeamPage(r io.Reader, ref TeamRef) (Team, []TeamScheduleRow, []TeamRef, error) {
	doc, err := goquery.NewDocumentFromReader(r)
	if err != nil {
		return Team{}, nil, nil, fmt.Errorf("parse team page: %w", err)
	}
	base, err := url.Parse(ref.URL)
	if err != nil {
		return Team{}, nil, nil, fmt.Errorf("parse team page URL: %w", err)
	}
	if doc.Find("table.schedule").Length() == 0 {
		return parseLegacyTeamPage(doc, base, ref)
	}

	header := doc.Find("#header").First()
	details := linesWithBreaks(header.Find("h3, h4").First())
	caption := doc.Find("table.schedule caption").First()
	captionLines := linesWithBreaks(caption)
	metadata := strings.Join(append(slices.Clone(details), captionLines...), "\n")

	team := Team{
		Season: ref.Season,
		TeamID: ref.TeamID,
		Name:   parseSchoolName(caption, ref),
	}
	team.Mascot = parseMascot(team.Name, header.Find("h2").First().Text())
	team.City, team.State, team.County = parseLocation(details)
	team.PrimaryColor, team.SecondaryColor = parseColors(header)
	team.Division, team.Region = parseDivisionRegion(metadata)

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
			opponentName = cleanText(opponentCell.Text())
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
			playoff = cleanText(row.Find(".playoff").First().Text())
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
	slices.SortFunc(opponentRefs, func(a, b TeamRef) int { return strings.Compare(a.Key(), b.Key()) })
	return team, games, opponentRefs, nil
}

func parseLegacyTeamPage(doc *goquery.Document, base *url.URL, ref TeamRef) (Team, []TeamScheduleRow, []TeamRef, error) {
	header := doc.Find("body > table").First().Find("td").First()
	details := linesWithBreaks(header)
	displayName := cleanText(header.Find("font").First().Text())

	team := Team{Season: ref.Season, TeamID: ref.TeamID, Name: cleanText(ref.Name)}
	team.Mascot = parseMascot(team.Name, displayName)
	team.City, team.State, team.County = parseLocation(details)
	team.Division, team.Region = parseDivisionRegion(strings.Join(details, "\n"))
	team.PrimaryColor, _ = header.Attr("bgcolor")
	team.SecondaryColor, _ = header.Find("font[color]").First().Attr("color")
	team.PrimaryColor = strings.TrimSpace(team.PrimaryColor)
	team.SecondaryColor = strings.TrimSpace(team.SecondaryColor)

	var games []TeamScheduleRow
	opponents := make(map[string]TeamRef)
	doc.Find("tr").Each(func(_ int, row *goquery.Selection) {
		cells := row.ChildrenFiltered("td")
		if cells.Length() < 6 || !gameDatePattern.MatchString(cleanText(cells.Eq(0).Text())) {
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
			notes = cleanText(cells.Eq(6).Text())
		}
		games = append(games, TeamScheduleRow{
			Season:         ref.Season,
			SourceTeamID:   ref.TeamID,
			GameDate:       cleanText(cells.Eq(0).Text()),
			HomeAway:       cleanText(cells.Eq(1).Text()),
			OpponentTeamID: opponent.TeamID,
			Result:         cleanText(cells.Eq(4).Text()),
			Score:          cleanText(cells.Eq(5).Text()),
			Notes:          notes,
			Playoff:        playoff,
		})
	})

	opponentRefs := make([]TeamRef, 0, len(opponents))
	for _, opponent := range opponents {
		opponentRefs = append(opponentRefs, opponent)
	}
	slices.SortFunc(opponentRefs, compareTeamRefs)
	return team, games, opponentRefs, nil
}

func legacyOpponentName(link *goquery.Selection) string {
	if link.Length() == 0 {
		return ""
	}
	clone := link.Clone()
	clone.Find("font").Remove()
	return cleanText(clone.Text())
}

func parseSchoolName(caption *goquery.Selection, ref TeamRef) string {
	text := cleanText(caption.Text())
	year := strconv.Itoa(ref.Season)
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`(?i)^` + regexp.QuoteMeta(year) + `\s+(.+?)\s+Football\b`),
		regexp.MustCompile(`(?i)^(.+?)\s+` + regexp.QuoteMeta(year) + `\s+Football\b`),
	}
	for _, pattern := range patterns {
		if match := pattern.FindStringSubmatch(text); len(match) == 2 {
			return cleanText(match[1])
		}
	}
	return cleanText(ref.Name)
}

func parseMascot(name, displayName string) string {
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

func parseLocation(lines []string) (city, state, county string) {
	for _, line := range lines {
		if strings.HasSuffix(strings.ToLower(line), " county") {
			county = strings.TrimSpace(line[:len(line)-len(" County")])
			continue
		}
		parts := strings.Split(line, ",")
		if len(parts) == 2 && city == "" {
			city = cleanText(parts[0])
			state = cleanText(parts[1])
		}
	}
	return city, state, county
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

func parseDivisionRegion(text string) (division, region string) {
	match := divisionPattern.FindStringSubmatch(text)
	if len(match) != 3 {
		return "", ""
	}
	return cleanText(match[1]), cleanText(match[2])
}

func linesWithBreaks(selection *goquery.Selection) []string {
	if selection.Length() == 0 {
		return nil
	}
	var builder strings.Builder
	writeNodeText(&builder, selection.Get(0))
	rawLines := strings.Split(builder.String(), "\n")
	lines := make([]string, 0, len(rawLines))
	for _, line := range rawLines {
		if line = cleanText(line); line != "" {
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

func textWithoutClasses(selection *goquery.Selection, excluded ...string) string {
	if selection.Length() == 0 {
		return ""
	}
	clone := selection.Clone()
	for _, class := range excluded {
		clone.Find("." + class).Remove()
	}
	return cleanText(clone.Text())
}

func cellText(row *goquery.Selection, selector string) string {
	return cleanText(row.Find(selector).First().Text())
}

func cleanText(value string) string {
	return strings.Join(strings.Fields(value), " ")
}

func teamKey(season int, teamID string) string {
	return strconv.Itoa(season) + ":" + teamID
}
