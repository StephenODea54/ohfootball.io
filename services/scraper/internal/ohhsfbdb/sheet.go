package ohhsfbdb

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"time"

	"github.com/PuerkitoBio/goquery"
)

// gameLabels are the column headings of the game log, in order.
var gameLabels = []string{
	"Year", "Week", "Date", "Day", "H/A", "Opponent", "TS", "OS", "OT", "W/L",
	"Opp Conf", "OppD", "OppR", "Playoff Round", "Tm-Seed", "Opp-Seed", "Stadium*", "Location*",
}

// summaryLabels are the column headings of the season block, in order.
var summaryLabels = []string{
	"Year", "Conference", "RW", "RL", "RT", "CW", "CL", "CT", "PW", "PL", "Div", "Reg", "Rank",
}

var (
	seasonPattern = regexp.MustCompile(`^(19|20)\d{2}$`)
	datePattern   = regexp.MustCompile(`^(\d{1,2})/(\d{1,2})/(\d{2})$`)
)

// homeAwayValues are the values the site uses. N is a game on neither ground,
// which is how it records a game of the state tournament.
var homeAwayValues = map[string]struct{}{"": {}, "H": {}, "A": {}, "N": {}}

// ErrNoGameRows reports a sheet whose game log is empty. Every sheet of the
// site holds at least one game, so an empty log means the page changed.
var ErrNoGameRows = errors.New("the sheet holds no game")

// cell is the text of one table cell, and the sheet that its link points to.
type cell struct {
	text  string
	sheet string
}

// ParseSheet reads one sheet and returns the school, its game log, and its
// season block.
//
// It returns every season the sheet holds. The caller keeps the seasons it
// wants, because the range of the backfill is a property of the run and not of
// the page.
//
// The parser fails rather than guess. It checks every column heading before it
// reads a row, so a workbook saved in another shape stops the run instead of
// filling the warehouse with fields read from the wrong columns.
func ParseSheet(doc *goquery.Document, sheet string) (SheetTeam, []GameRow, []SeasonSummaryRow, error) {
	rows := tableRows(doc)
	if len(rows) == 0 {
		return SheetTeam{}, nil, nil, fmt.Errorf("sheet %s holds no table row", sheet)
	}

	labelRow, gameAt, summaryAt, err := findColumns(rows, sheet)
	if err != nil {
		return SheetTeam{}, nil, nil, err
	}

	team, err := parseHeader(rows[0], sheet)
	if err != nil {
		return SheetTeam{}, nil, nil, err
	}

	var games []GameRow
	var summaries []SeasonSummaryRow
	for _, row := range rows[labelRow+1:] {
		if season, ok := seasonAt(row, gameAt); ok {
			game, err := parseGame(row, gameAt, sheet, season)
			if err != nil {
				return SheetTeam{}, nil, nil, err
			}
			games = append(games, game)
		}
		if season, ok := seasonAt(row, summaryAt); ok {
			summaries = append(summaries, parseSummary(row, summaryAt, sheet, season))
		}
	}

	if len(games) == 0 {
		return SheetTeam{}, nil, nil, fmt.Errorf("sheet %s: %w", sheet, ErrNoGameRows)
	}
	return team, games, summaries, nil
}

// tableRows reads every row of the page as its cells.
func tableRows(doc *goquery.Document) [][]cell {
	var rows [][]cell
	doc.Find("tr").Each(func(_ int, row *goquery.Selection) {
		var cells []cell
		row.Find("td, th").Each(func(_ int, node *goquery.Selection) {
			current := cell{text: cleanText(node.Text())}
			if href, ok := node.Find("a[href]").First().Attr("href"); ok {
				if target, isSheet := sheetOf(href); isSheet {
					current.sheet = target
				}
			}
			cells = append(cells, current)
		})
		rows = append(rows, cells)
	})
	return rows
}

// findColumns locates the heading row and the first column of each block.
//
// The two blocks sit side by side with empty cells between them. The offsets
// come from the page rather than from a constant, so a column added between
// the blocks moves the second block instead of shifting its fields.
func findColumns(rows [][]cell, sheet string) (labelRow, gameAt, summaryAt int, err error) {
	for number, row := range rows {
		if at(row, 0) != gameLabels[0] || at(row, 1) != gameLabels[1] {
			continue
		}
		if err := matchLabels(row, 0, gameLabels, sheet, "game log"); err != nil {
			return 0, 0, 0, err
		}
		start, err := findSummaryStart(row, sheet)
		if err != nil {
			return 0, 0, 0, err
		}
		return number, 0, start, nil
	}
	return 0, 0, 0, fmt.Errorf("sheet %s holds no row of column headings", sheet)
}

// findSummaryStart returns the first column of the season block. The block
// follows the game log after one or more empty cells.
func findSummaryStart(row []cell, sheet string) (int, error) {
	for position := len(gameLabels); position < len(row); position++ {
		if at(row, position) == "" {
			continue
		}
		if err := matchLabels(row, position, summaryLabels, sheet, "season block"); err != nil {
			return 0, err
		}
		return position, nil
	}
	return 0, fmt.Errorf("sheet %s holds no column headings for the season block", sheet)
}

// matchLabels checks the headings of one block. Cells after the last heading
// are ignored, because some sheets carry empty cells at the end of every row.
func matchLabels(row []cell, start int, labels []string, sheet, block string) error {
	for offset, want := range labels {
		if got := at(row, start+offset); got != want {
			return fmt.Errorf(
				"sheet %s: the %s heading in column %d is %q, want %q", sheet, block, start+offset+1, got, want)
		}
	}
	return nil
}

// parseHeader reads the school from the first row of the sheet.
//
// The row holds the identifier of the school on the other site, then the short
// name, then a link back to the index. A school that closed before that site
// began carries no identifier, which is ordinary data and not an error.
func parseHeader(row []cell, sheet string) (SheetTeam, error) {
	var values []string
	for _, current := range row {
		if current.text == "Main Table" {
			break
		}
		if current.text != "" {
			values = append(values, current.text)
		}
	}
	if len(values) == 0 {
		return SheetTeam{}, fmt.Errorf("sheet %s names no school in its first row", sheet)
	}

	team := SheetTeam{Sheet: sheet}
	if _, err := strconv.Atoi(values[0]); err == nil {
		team.Number = values[0]
		values = values[1:]
	}
	if len(values) > 0 {
		team.ShortName = values[0]
	}
	if team.ShortName == "" {
		return SheetTeam{}, fmt.Errorf("sheet %s names no school in its first row", sheet)
	}
	return team, nil
}

// seasonAt reports the season of one block of one row. The second result is
// false when the row carries no season there, which is how a row that
// separates two seasons is told from a row that holds data.
func seasonAt(row []cell, start int) (int, bool) {
	value := at(row, start)
	if !seasonPattern.MatchString(value) {
		return 0, false
	}
	// The pattern allows four digits and nothing else, so this cannot fail.
	season, _ := strconv.Atoi(value)
	return season, true
}

func parseGame(row []cell, start int, sheet string, season int) (GameRow, error) {
	game := GameRow{
		Sheet:              sheet,
		Season:             season,
		Week:               at(row, start+1),
		GameDate:           at(row, start+2),
		DayOfWeek:          at(row, start+3),
		HomeAway:           at(row, start+4),
		OpponentName:       at(row, start+5),
		OpponentSheet:      sheetAt(row, start+5),
		TeamScore:          at(row, start+6),
		OpponentScore:      at(row, start+7),
		Overtime:           at(row, start+8),
		Result:             at(row, start+9),
		OpponentConference: at(row, start+10),
		OpponentDivision:   at(row, start+11),
		OpponentRegion:     at(row, start+12),
		PlayoffRound:       at(row, start+13),
		TeamSeed:           at(row, start+14),
		OpponentSeed:       at(row, start+15),
		Stadium:            at(row, start+16),
		Location:           at(row, start+17),
	}

	if _, known := homeAwayValues[game.HomeAway]; !known {
		return GameRow{}, fmt.Errorf(
			"sheet %s, season %d: the ground of the game is %q, want H, A, N, or nothing",
			sheet, season, game.HomeAway)
	}
	if err := checkDate(game.GameDate, season); err != nil {
		return GameRow{}, fmt.Errorf("sheet %s, season %d: %w", sheet, season, err)
	}
	return game, nil
}

// checkDate reads the date of one game. An empty date is allowed, because some
// rows carry none.
//
// The check covers the shape of the date and the day it names. It does not
// require the two digit year to agree with the season of its own row. The site
// is kept by hand and holds a few rows whose year is a slip of the keyboard,
// such as 10/30/90 in the season of 1992. One such row is a wrong digit, not a
// sign that the columns moved, because moved columns put text that is no date
// at all in this cell and do so on every row of the sheet. A later layer builds
// the date of a game from the season and the day of the month, so a wrong year
// changes nothing downstream.
func checkDate(value string, season int) error {
	if value == "" {
		return nil
	}
	parts := datePattern.FindStringSubmatch(value)
	if parts == nil {
		return fmt.Errorf("the date %q is not in the form M/D/YY", value)
	}

	month, _ := strconv.Atoi(parts[1])
	day, _ := strconv.Atoi(parts[2])

	date := time.Date(season, time.Month(month), day, 0, 0, 0, 0, time.UTC)
	if int(date.Month()) != month || date.Day() != day {
		return fmt.Errorf("the date %q names no day of the calendar", value)
	}
	return nil
}

func parseSummary(row []cell, start int, sheet string, season int) SeasonSummaryRow {
	return SeasonSummaryRow{
		Sheet:            sheet,
		Season:           season,
		Conference:       at(row, start+1),
		RegularWins:      at(row, start+2),
		RegularLosses:    at(row, start+3),
		RegularTies:      at(row, start+4),
		ConferenceWins:   at(row, start+5),
		ConferenceLosses: at(row, start+6),
		ConferenceTies:   at(row, start+7),
		PlayoffWins:      at(row, start+8),
		PlayoffLosses:    at(row, start+9),
		Division:         at(row, start+10),
		Region:           at(row, start+11),
		Rank:             at(row, start+12),
	}
}

// at returns the text of one cell. A row that stops early reads as empty,
// because the sheets do not all carry the same number of cells.
func at(row []cell, position int) string {
	if position >= len(row) {
		return ""
	}
	return row[position].text
}

// sheetAt returns the sheet that the link of one cell points to, or an empty
// string. The site links an opponent on some rows and not on others.
func sheetAt(row []cell, position int) string {
	if position >= len(row) {
		return ""
	}
	return row[position].sheet
}
