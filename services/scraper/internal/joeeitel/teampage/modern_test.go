package teampage

import (
	"testing"

	"github.com/StephenODea54/services/scraper/internal/joeeitel"
)

func TestModernParserReadsASavedPage(t *testing.T) {
	ref := joeeitel.TeamRef{Season: 2025, TeamID: "1346", Name: "St Edward", URL: teamURL("1346", 2025)}
	doc, base := loadPage(t, "team_modern.html", ref.URL)

	team, rows, opponents, err := Parse(doc, base, ref)
	if err != nil {
		t.Fatalf("Parse returned %v", err)
	}

	if team.Name != "St Edward" || team.Mascot != "Eagles" {
		t.Errorf("name is %q and mascot is %q", team.Name, team.Mascot)
	}
	if team.City != "Lakewood" || team.State != "OH" || team.County != "Cuyahoga" {
		t.Errorf("location is %+v", team)
	}
	if team.Division == "" {
		t.Error("the division is empty")
	}
	if len(rows) == 0 {
		t.Fatal("the page produced no schedule rows")
	}
	for _, row := range rows {
		if row.Season != 2025 || row.SourceTeamID != "1346" {
			t.Errorf("row is %+v", row)
		}
	}
	if len(opponents) == 0 {
		t.Error("the page produced no opponents")
	}
	for _, opponent := range opponents {
		if opponent.Season != 2025 {
			t.Errorf("opponent %s has season %d, want 2025", opponent.TeamID, opponent.Season)
		}
	}
}

func TestModernParserReadsTheFieldsOfOneRow(t *testing.T) {
	html := `<html><body>
<div id="header" style="background-color:#006836;color:#FFD700;">
  <h2>St Edward Eagles</h2><h4><br>Lakewood, OH<br>Cuyahoga County<br></h4>
</div>
<table class="schedule">
  <caption><strong>2025 St Edward Football (11-3)</strong><br>Coach: Tom Lombardo<br>Division I, Region 1</caption>
  <tbody><tr>
    <td class="gameDate">8/30</td><td class="homeAway">H</td>
    <td class="opponent"><span class="playoff"># </span><a class="teamLink" href="teams.jsp?teamID=17525&amp;year=2025">Delbarton School (NJ) <span class="wltRecord">(4-6)</span></a></td>
    <td class="divisionRegion">[II]</td><td class="result">W</td><td class="score">35-21</td><td class="resultNote">OT</td>
  </tr></tbody>
</table></body></html>`
	ref := joeeitel.TeamRef{Season: 2025, TeamID: "1346", Name: "St Edward", URL: teamURL("1346", 2025)}
	doc, base := documentFrom(t, html, ref.URL)

	team, rows, opponents, err := Parse(doc, base, ref)
	if err != nil {
		t.Fatalf("Parse returned %v", err)
	}
	if team.PrimaryColor != "#006836" || team.SecondaryColor != "#FFD700" {
		t.Errorf("colors are %q and %q", team.PrimaryColor, team.SecondaryColor)
	}
	if team.Division != "I" || team.Region != "1" {
		t.Errorf("division is %q and region is %q", team.Division, team.Region)
	}
	if len(rows) != 1 || len(opponents) != 1 {
		t.Fatalf("got %d rows and %d opponents, want 1 and 1", len(rows), len(opponents))
	}
	row := rows[0]
	if row.OpponentTeamID != "17525" || row.Score != "35-21" || row.Playoff != "#" || row.Notes != "OT" {
		t.Errorf("row is %+v", row)
	}
	if opponents[0].Name != "Delbarton School (NJ)" {
		t.Errorf("opponent name is %q", opponents[0].Name)
	}
}

// Older modern pages write the year after the school name in the caption.
func TestModernParserReadsTheNameInEitherCaptionOrder(t *testing.T) {
	html := `<html><body>
<div id="header"><h2>St Edward Eagles</h2><h3><br/>Lakewood, OH<br/>OHSAA Division I, Region 1</h3></div>
<table class="schedule"><caption>St Edward 2013 Football (6-4)</caption><tbody><tr>
<td class="gameDate">8/26</td><td class="homeAway">A</td>
<td class="opponent"><a class="teamLink" href="teams.jsp?teamID=1026&amp;year=2013">Middletown</a></td>
<td class="result">W</td><td class="score">25-22</td><td class="resultNote"></td>
</tr></tbody></table></body></html>`
	ref := joeeitel.TeamRef{Season: 2013, TeamID: "1346", URL: teamURL("1346", 2013)}
	doc, base := documentFrom(t, html, ref.URL)

	team, rows, _, err := Parse(doc, base, ref)
	if err != nil {
		t.Fatalf("Parse returned %v", err)
	}
	if team.Name != "St Edward" || team.Mascot != "Eagles" {
		t.Errorf("name is %q and mascot is %q", team.Name, team.Mascot)
	}
	if len(rows) != 1 || rows[0].Score != "25-22" {
		t.Errorf("rows are %+v", rows)
	}
}

// A caption that names no year leaves the name of the reference in place.
func TestModernParserFallsBackToTheReferenceName(t *testing.T) {
	html := `<html><body><div id="header"><h2>Ada Bulldogs</h2></div>
<table class="schedule"><caption>Schedule</caption><tbody></tbody></table></body></html>`
	ref := joeeitel.TeamRef{Season: 2025, TeamID: "1", Name: "Ada", URL: teamURL("1", 2025)}
	doc, base := documentFrom(t, html, ref.URL)

	team, _, _, err := Parse(doc, base, ref)
	if err != nil {
		t.Fatalf("Parse returned %v", err)
	}
	if team.Name != "Ada" || team.Mascot != "Bulldogs" {
		t.Errorf("name is %q and mascot is %q", team.Name, team.Mascot)
	}
}

// A row without an opponent cell is not a schedule row.
func TestModernParserSkipsARowWithoutAnOpponent(t *testing.T) {
	html := `<html><body><div id="header"><h2>Ada</h2></div>
<table class="schedule"><caption>2025 Ada Football</caption>
<tbody><tr><td class="note">bye week</td></tr></tbody></table></body></html>`
	ref := joeeitel.TeamRef{Season: 2025, TeamID: "1", Name: "Ada", URL: teamURL("1", 2025)}
	doc, base := documentFrom(t, html, ref.URL)

	_, rows, opponents, err := Parse(doc, base, ref)
	if err != nil {
		t.Fatalf("Parse returned %v", err)
	}
	if len(rows) != 0 || len(opponents) != 0 {
		t.Errorf("got %d rows and %d opponents, want none", len(rows), len(opponents))
	}
}

// An opponent without a link has a name but no identifier.
func TestModernParserKeepsARowWhoseOpponentHasNoLink(t *testing.T) {
	html := `<html><body><div id="header"><h2>Ada</h2></div>
<table class="schedule"><caption>2025 Ada Football</caption>
<tbody><tr><td class="gameDate">8/30</td><td class="homeAway">H</td>
<td class="opponent">Some School</td><td class="result">W</td><td class="score">7-0</td>
</tr></tbody></table></body></html>`
	ref := joeeitel.TeamRef{Season: 2025, TeamID: "1", Name: "Ada", URL: teamURL("1", 2025)}
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
