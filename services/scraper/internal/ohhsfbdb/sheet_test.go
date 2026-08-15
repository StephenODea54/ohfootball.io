package ohhsfbdb

import (
	"errors"
	"html"
	"strings"
	"testing"
)

// buildSheet writes a sheet from rows of cells, so a test can state exactly
// the shape it wants.
func buildSheet(rows ...[]string) string {
	var markup strings.Builder
	markup.WriteString("<html><body><table>")
	for _, row := range rows {
		markup.WriteString("<tr>")
		for _, value := range row {
			markup.WriteString("<td>" + html.EscapeString(value) + "</td>")
		}
		markup.WriteString("</tr>")
	}
	markup.WriteString("</table></body></html>")
	return markup.String()
}

// headings returns the row of column headings of a whole sheet.
func headings() []string {
	row := append([]string{}, gameLabels...)
	row = append(row, "")
	return append(row, summaryLabels...)
}

// gameCells returns one row of the game log, padded to the width of the
// headings so the season block stays empty.
func gameCells(values ...string) []string {
	row := make([]string, len(headings()))
	copy(row, values)
	return row
}

func TestParseSheetReadsTheSavedSheet(t *testing.T) {
	team, games, summaries, err := ParseSheet(fixtureDocument(t, "sheet_ada.htm"), "sheet002")
	if err != nil {
		t.Fatalf("ParseSheet returned %v", err)
	}

	if team.Sheet != "sheet002" || team.Number != "100" || team.ShortName != "Ada" {
		t.Errorf("the school is %+v", team)
	}
	if len(games) == 0 {
		t.Fatal("ParseSheet returned no game")
	}

	first := games[0]
	want := GameRow{
		Sheet: "sheet002", Season: 1972, Week: "1", GameDate: "9/8/72", DayOfWeek: "Fri",
		HomeAway: "A", OpponentName: "Delphos Jefferson", OpponentSheet: "sheet175",
		TeamScore: "38", OpponentScore: "0", Overtime: "", Result: "W",
		OpponentConference: "Northwest", OpponentDivision: "3", OpponentRegion: "10",
		Stadium: "Stadium Park", Location: "Delphos",
	}
	if first != want {
		t.Errorf("the first game is\n%+v\nwant\n%+v", first, want)
	}

	// The parser returns every season. The caller keeps the ones it wants.
	var seasons []int
	for _, game := range games {
		seasons = append(seasons, game.Season)
	}
	if !contains(seasons, 2015) {
		t.Errorf("the seasons are %v, want them to include 2015", seasons)
	}

	if len(summaries) == 0 {
		t.Fatal("ParseSheet returned no season summary")
	}
	if summaries[0].Season != 1972 || summaries[0].Conference != "Northwest" {
		t.Errorf("the first season summary is %+v", summaries[0])
	}
	if summaries[0].Division == "" || summaries[0].Region == "" || summaries[0].Rank == "" {
		t.Errorf("the first season summary holds no division, region, or rank: %+v", summaries[0])
	}
}

func TestParseSheetReadsAGameOnNeitherGround(t *testing.T) {
	_, games, _, err := ParseSheet(fixtureDocument(t, "sheet_ada.htm"), "sheet002")
	if err != nil {
		t.Fatalf("ParseSheet returned %v", err)
	}

	var neutral []GameRow
	for _, game := range games {
		if game.HomeAway == "N" {
			neutral = append(neutral, game)
		}
	}
	if len(neutral) == 0 {
		t.Fatal("the saved sheet holds a game on neither ground, and ParseSheet returned none")
	}
	if neutral[0].PlayoffRound == "" {
		t.Errorf("the game on neither ground names no round of the tournament: %+v", neutral[0])
	}
}

func TestParseSheetReadsASheetWithCellsAfterTheSeasonBlock(t *testing.T) {
	team, games, _, err := ParseSheet(fixtureDocument(t, "sheet_wide.htm"), "sheet577")
	if err != nil {
		t.Fatalf("ParseSheet returned %v", err)
	}
	if team.ShortName == "" {
		t.Errorf("the school is %+v", team)
	}
	if len(games) == 0 {
		t.Error("ParseSheet returned no game for a sheet with extra cells")
	}
}

func TestParseSheetReadsASchoolWithNoNumber(t *testing.T) {
	markup := buildSheet(
		[]string{"", "", "Cathedral Latin", "", "Main Table"},
		headings(),
		gameCells("1974", "1", "9/6/74", "Fri", "H", "Benedictine", "6", "20", "", "L"),
	)
	team, games, _, err := ParseSheet(document(t, markup), "sheet725")
	if err != nil {
		t.Fatalf("ParseSheet returned %v", err)
	}
	if team.Number != "" {
		t.Errorf("the number is %q, want it empty", team.Number)
	}
	if team.ShortName != "Cathedral Latin" {
		t.Errorf("the short name is %q", team.ShortName)
	}
	if len(games) != 1 {
		t.Errorf("ParseSheet returned %d games, want 1", len(games))
	}
}

func TestParseSheetSkipsRowsThatHoldNoSeason(t *testing.T) {
	markup := buildSheet(
		[]string{"100", "Ada", "Main Table"},
		make([]string, 5),
		headings(),
		gameCells("1972", "1", "9/8/72", "Fri", "A", "Bluffton", "33", "0", "", "W"),
		gameCells(),
		gameCells("", "", "", "", "", "a note about the season"),
		gameCells("1973", "1", "9/7/73", "Fri", "H", "Bluffton", "42", "0", "", "W"),
	)
	_, games, _, err := ParseSheet(document(t, markup), "sheet002")
	if err != nil {
		t.Fatalf("ParseSheet returned %v", err)
	}
	if len(games) != 2 {
		t.Fatalf("ParseSheet returned %d games, want 2", len(games))
	}
}

func TestParseSheetReadsTheSeasonBlockApartFromTheGameLog(t *testing.T) {
	row := gameCells("1972", "1", "9/8/72", "Fri", "A", "Bluffton", "33", "0", "", "W")
	start := len(gameLabels) + 1
	copy(row[start:], []string{"1975", "Northwest", "8", "1", "", "7", "1", "", "", "", "3", "10", "7"})

	_, games, summaries, err := ParseSheet(document(t, buildSheet(
		[]string{"100", "Ada", "Main Table"}, headings(), row)), "sheet002")
	if err != nil {
		t.Fatalf("ParseSheet returned %v", err)
	}
	if len(games) != 1 || games[0].Season != 1972 {
		t.Fatalf("the games are %+v", games)
	}
	if len(summaries) != 1 || summaries[0].Season != 1975 {
		t.Fatalf("the season summaries are %+v", summaries)
	}
	if summaries[0].RegularWins != "8" || summaries[0].Rank != "7" {
		t.Errorf("the season summary is %+v", summaries[0])
	}
}

func TestParseSheetRejectsAPageItCannotRead(t *testing.T) {
	valid := []string{"100", "Ada", "Main Table"}

	wrongGameLabel := headings()
	wrongGameLabel[6] = "Points"

	wrongSummaryLabel := headings()
	wrongSummaryLabel[len(gameLabels)+1+2] = "Wins"

	noSummaryBlock := append(append([]string{}, gameLabels...), "", "")

	tests := []struct {
		name   string
		markup string
		want   string
	}{
		{
			name:   "no table row",
			markup: "<html><body><p>nothing</p></body></html>",
			want:   "holds no table row",
		},
		{
			name:   "no row of column headings",
			markup: buildSheet(valid, []string{"Season", "Wk"}),
			want:   "holds no row of column headings",
		},
		{
			name:   "a heading of the game log is wrong",
			markup: buildSheet(valid, wrongGameLabel),
			want:   "the game log heading in column 7 is \"Points\", want \"TS\"",
		},
		{
			name:   "a heading of the season block is wrong",
			markup: buildSheet(valid, wrongSummaryLabel),
			want:   "the season block heading in column 22 is \"Wins\", want \"RW\"",
		},
		{
			name:   "no headings for the season block",
			markup: buildSheet(valid, noSummaryBlock),
			want:   "holds no column headings for the season block",
		},
		{
			name:   "no school in the first row",
			markup: buildSheet([]string{"", "", "Main Table"}, headings()),
			want:   "names no school in its first row",
		},
		{
			name:   "a number and no school",
			markup: buildSheet([]string{"100", "Main Table"}, headings()),
			want:   "names no school in its first row",
		},
		{
			name:   "no game",
			markup: buildSheet(valid, headings()),
			want:   "the sheet holds no game",
		},
		{
			name: "the ground of the game is unknown",
			markup: buildSheet(valid, headings(),
				gameCells("1972", "1", "9/8/72", "Fri", "away", "Bluffton", "33", "0", "", "W")),
			want: "the ground of the game is \"away\"",
		},
		{
			name: "the date is not a date",
			markup: buildSheet(valid, headings(),
				gameCells("1972", "1", "September", "Fri", "A", "Bluffton", "33", "0", "", "W")),
			want: "is not in the form M/D/YY",
		},
		{
			name: "the date falls in another season",
			markup: buildSheet(valid, headings(),
				gameCells("1972", "1", "9/8/73", "Fri", "A", "Bluffton", "33", "0", "", "W")),
			want: "does not fall in season 1972",
		},
		{
			name: "the date names no day",
			markup: buildSheet(valid, headings(),
				gameCells("1972", "1", "2/30/72", "Fri", "A", "Bluffton", "33", "0", "", "W")),
			want: "names no day of the calendar",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, games, _, err := ParseSheet(document(t, test.markup), "sheet002")
			if err == nil {
				t.Fatalf("ParseSheet returned no error, and gave %d games", len(games))
			}
			if !strings.Contains(err.Error(), test.want) {
				t.Errorf("error is %q, want it to contain %q", err, test.want)
			}
		})
	}
}

func TestParseSheetReportsAnEmptyGameLogWithASentinel(t *testing.T) {
	markup := buildSheet([]string{"100", "Ada", "Main Table"}, headings())
	if _, _, _, err := ParseSheet(document(t, markup), "sheet002"); !errors.Is(err, ErrNoGameRows) {
		t.Fatalf("ParseSheet returned %v, want ErrNoGameRows", err)
	}
}

func TestParseSheetAllowsAGameWithNoDate(t *testing.T) {
	markup := buildSheet(
		[]string{"100", "Ada", "Main Table"}, headings(),
		gameCells("1972", "1", "", "", "", "Bluffton", "", "", "", ""),
	)
	_, games, _, err := ParseSheet(document(t, markup), "sheet002")
	if err != nil {
		t.Fatalf("ParseSheet returned %v", err)
	}
	if len(games) != 1 || games[0].GameDate != "" {
		t.Errorf("the games are %+v", games)
	}
}

func TestParseSheetReadsARowThatStopsEarly(t *testing.T) {
	markup := buildSheet(
		[]string{"100", "Ada", "Main Table"}, headings(),
		[]string{"1972", "1", "9/8/72"},
	)
	_, games, summaries, err := ParseSheet(document(t, markup), "sheet002")
	if err != nil {
		t.Fatalf("ParseSheet returned %v", err)
	}
	if len(games) != 1 {
		t.Fatalf("ParseSheet returned %d games, want 1", len(games))
	}
	if games[0].OpponentName != "" || games[0].OpponentSheet != "" || games[0].Location != "" {
		t.Errorf("the fields after the end of the row are not empty: %+v", games[0])
	}
	if len(summaries) != 0 {
		t.Errorf("ParseSheet returned %d season summaries, want 0", len(summaries))
	}
}

func contains(values []int, want int) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}
