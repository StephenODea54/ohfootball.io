package teampage

import (
	"testing"

	"github.com/StephenODea54/services/scraper/internal/joeeitel"
)

func TestLegacyParserReadsASavedPage(t *testing.T) {
	ref := joeeitel.TeamRef{Season: 2002, TeamID: "1346", Name: "St Edward", URL: teamURL("1346", 2002)}
	doc, base := loadPage(t, "team_legacy_2002.html", ref.URL)

	team, rows, opponents, err := Parse(doc, base, ref)
	if err != nil {
		t.Fatalf("Parse returned %v", err)
	}

	if team.Name != "St Edward" || team.Mascot != "Eagles" {
		t.Errorf("name is %q and mascot is %q", team.Name, team.Mascot)
	}
	if team.City != "Lakewood" || team.State != "OH" {
		t.Errorf("location is %+v", team)
	}
	if team.PrimaryColor == "" {
		t.Error("the primary color is empty")
	}
	if len(rows) == 0 {
		t.Fatal("the page produced no schedule rows")
	}
	for _, row := range rows {
		if row.Season != 2002 || row.SourceTeamID != "1346" {
			t.Errorf("row is %+v", row)
		}
	}
	// The legacy links carry no year, so the season must come from the run.
	for _, opponent := range opponents {
		if opponent.Season != 2002 {
			t.Errorf("opponent %s has season %d, want 2002", opponent.TeamID, opponent.Season)
		}
	}
}

func TestLegacyParserReadsALaterSavedPage(t *testing.T) {
	ref := joeeitel.TeamRef{Season: 2008, TeamID: "1346", Name: "St Edward", URL: teamURL("1346", 2008)}
	doc, base := loadPage(t, "team_legacy_2008.html", ref.URL)

	team, rows, _, err := Parse(doc, base, ref)
	if err != nil {
		t.Fatalf("Parse returned %v", err)
	}
	if team.Name != "St Edward" || len(rows) == 0 {
		t.Errorf("team is %+v and it produced %d rows", team, len(rows))
	}
}

func TestLegacyParserReadsTheFieldsOfOneRow(t *testing.T) {
	html := `<html><body>
<table><tr><td bgcolor="green"><font size="+2" color="gold"><b>St Edward Eagles</b></font><br><font color="gold"><br>Lakewood, OH<br>Cuyahoga County<br>OHSAA Division 1, Region 1</font></td></tr></table>
<table><tr><td colspan="6">St Edward 2002</td><td></td></tr>
<tr><td>8/24</td><td>H</td><td><a href="teams.jsp?teamID=1580&amp;year=2002">Ursuline<font color="#aa0011"> (8-6) </font></a></td><td>[4:13]</td><td>W</td><td>31-12</td><td></td></tr>
<tr><td>11/2</td><td>N</td><td><a href="teams.jsp?teamID=1588&amp;year=2002"><font color="#ff0022"># </font>Valley Forge<font color="#aa0011"> (8-3) </font></a></td><td>[1:1]</td><td>L</td><td>16-18</td><td>OT</td></tr>
</table></body></html>`
	ref := joeeitel.TeamRef{Season: 2002, TeamID: "1346", Name: "St Edward", URL: teamURL("1346", 2002)}
	doc, base := documentFrom(t, html, ref.URL)

	team, rows, opponents, err := Parse(doc, base, ref)
	if err != nil {
		t.Fatalf("Parse returned %v", err)
	}
	if team.City != "Lakewood" || team.State != "OH" || team.County != "Cuyahoga" {
		t.Errorf("location is %+v", team)
	}
	if team.PrimaryColor != "green" || team.SecondaryColor != "gold" {
		t.Errorf("colors are %q and %q", team.PrimaryColor, team.SecondaryColor)
	}
	if team.Division != "1" || team.Region != "1" {
		t.Errorf("division is %q and region is %q", team.Division, team.Region)
	}
	if len(rows) != 2 || len(opponents) != 2 {
		t.Fatalf("got %d rows and %d opponents, want 2 and 2", len(rows), len(opponents))
	}
	if rows[0].OpponentTeamID != "1580" || rows[0].Result != "W" || rows[0].Score != "31-12" {
		t.Errorf("first row is %+v", rows[0])
	}
	if rows[1].HomeAway != "N" || rows[1].Playoff != "#" || rows[1].Notes != "OT" {
		t.Errorf("second row is %+v", rows[1])
	}
	if opponents[1].Name != "Valley Forge" {
		t.Errorf("second opponent is %q", opponents[1].Name)
	}
}

// A row with too few cells, or whose first cell is not a date, is not a
// schedule row. The legacy pages carry no class names to tell them apart.
func TestLegacyParserSkipsRowsThatAreNotGames(t *testing.T) {
	html := `<html><body>
<table><tr><td bgcolor="green"><font>Ada Bulldogs</font></td></tr></table>
<table>
<tr><td>Header</td><td>row</td></tr>
<tr><td>notadate</td><td>H</td><td>x</td><td>y</td><td>W</td><td>7-0</td></tr>
<tr><td>8/24</td><td>H</td><td><a href="teams.jsp?teamID=5">Rival</a></td><td>[1:1]</td><td>W</td><td>7-0</td></tr>
</table></body></html>`
	ref := joeeitel.TeamRef{Season: 2002, TeamID: "1", Name: "Ada", URL: teamURL("1", 2002)}
	doc, base := documentFrom(t, html, ref.URL)

	_, rows, opponents, err := Parse(doc, base, ref)
	if err != nil {
		t.Fatalf("Parse returned %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("got %d rows, want 1", len(rows))
	}
	if rows[0].Notes != "" {
		t.Errorf("notes are %q, want empty for a row of six cells", rows[0].Notes)
	}
	if len(opponents) != 1 || opponents[0].Season != 2002 {
		t.Errorf("opponents are %+v", opponents)
	}
}

func TestLegacyParserKeepsARowWhoseOpponentHasNoLink(t *testing.T) {
	html := `<html><body>
<table><tr><td bgcolor="green"><font>Ada Bulldogs</font></td></tr></table>
<table><tr><td>8/24</td><td>H</td><td>Some School</td><td>[1:1]</td><td>W</td><td>7-0</td></tr></table>
</body></html>`
	ref := joeeitel.TeamRef{Season: 2002, TeamID: "1", Name: "Ada", URL: teamURL("1", 2002)}
	doc, base := documentFrom(t, html, ref.URL)

	_, rows, opponents, err := Parse(doc, base, ref)
	if err != nil {
		t.Fatalf("Parse returned %v", err)
	}
	if len(rows) != 1 || rows[0].OpponentTeamID != "" {
		t.Errorf("rows are %+v", rows)
	}
	if len(opponents) != 0 {
		t.Errorf("got %d opponents, want none", len(opponents))
	}
}
