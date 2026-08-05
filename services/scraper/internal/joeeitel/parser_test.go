package joeeitel

import (
	"strings"
	"testing"
)

func TestParseRegionTeamsHandlesHistoricalMarkupAndCanonicalizesURL(t *testing.T) {
	html := `<html><body><pre>
<a href="https://www.joeeitel.com/hsfoot/teams.jsp?year=2000&amp;teamID=1346">LAKEWOOD ST EDWARD</a>
<a href="https://joeeitel.com/hsfoot/teams.jsp?teamID=1346&amp;year=2000">duplicate</a>
</pre></body></html>`

	teams, err := parseRegionTeams(strings.NewReader(html), "https://joeeitel.com/hsfoot/rankings/2000/region-1", 2000)
	if err != nil {
		t.Fatal(err)
	}
	if len(teams) != 1 {
		t.Fatalf("got %d teams, want 1", len(teams))
	}
	if teams[0].TeamID != "1346" || teams[0].Season != 2000 {
		t.Fatalf("unexpected team reference: %+v", teams[0])
	}
	if teams[0].URL != "https://joeeitel.com/hsfoot/teams.jsp?teamID=1346&year=2000" {
		t.Fatalf("unexpected canonical URL: %s", teams[0].URL)
	}
}

func TestParseCurrentTeamPage(t *testing.T) {
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
	ref := TeamRef{Season: 2025, TeamID: "1346", Name: "St Edward", URL: "https://joeeitel.com/hsfoot/teams.jsp?teamID=1346&year=2025"}

	team, games, opponents, err := parseTeamPage(strings.NewReader(html), ref)
	if err != nil {
		t.Fatal(err)
	}
	if team.Name != "St Edward" || team.Mascot != "Eagles" {
		t.Fatalf("unexpected name or mascot: name=%q mascot=%q", team.Name, team.Mascot)
	}
	if team.City != "Lakewood" || team.State != "OH" || team.County != "Cuyahoga" {
		t.Fatalf("unexpected location: %+v", team)
	}
	if team.PrimaryColor != "#006836" || team.SecondaryColor != "#FFD700" {
		t.Fatalf("unexpected colors: %q %q", team.PrimaryColor, team.SecondaryColor)
	}
	if team.Division != "I" || team.Region != "1" {
		t.Fatalf("unexpected metadata: %+v", team)
	}
	if len(games) != 1 || len(opponents) != 1 {
		t.Fatalf("got %d games and %d opponents", len(games), len(opponents))
	}
	game := games[0]
	if game.OpponentTeamID != "17525" || game.Score != "35-21" || game.Playoff != "#" {
		t.Fatalf("unexpected game: %+v", game)
	}
	if opponents[0].Name != "Delbarton School (NJ)" {
		t.Fatalf("unexpected opponent: %+v", opponents[0])
	}
}

func TestParseHistoricalTeamPage(t *testing.T) {
	html := `<html><body>
<div id="header" style="background-color:#006836;color:#FFD700;"><h2>St Edward Eagles</h2><h3><br/>Lakewood, OH<br/>Cuyahoga County<br/>OHSAA Division I, Region 1</h3></div>
<table class="schedule"><caption>St Edward 2000 Football (6-4)</caption><tbody><tr>
<td class="gameDate">8/26</td><td class="homeAway">A</td><td class="opponent"><a class="teamLink" href="teams.jsp?teamID=1026&amp;year=2000">Middletown <span class="wltRecord">(2-8)</span></a></td><td class="divisionRegion">[1:4]</td><td class="result">W</td><td class="score">25-22</td><td class="resultNote"></td>
</tr></tbody></table></body></html>`
	ref := TeamRef{Season: 2000, TeamID: "1346", URL: "https://joeeitel.com/hsfoot/teams.jsp?teamID=1346&year=2000"}

	team, games, _, err := parseTeamPage(strings.NewReader(html), ref)
	if err != nil {
		t.Fatal(err)
	}
	if team.Name != "St Edward" || team.Mascot != "Eagles" || team.Division != "I" || team.Region != "1" {
		t.Fatalf("unexpected historical team: %+v", team)
	}
	if len(games) != 1 || games[0].Score != "25-22" {
		t.Fatalf("unexpected historical games: %+v", games)
	}
}

func TestParseLegacyTeamPage(t *testing.T) {
	html := `<html><body>
<table><tr><td bgcolor="green"><font size="+2" color="gold"><b>St Edward Eagles</b></font><br><font color="gold"><br>Lakewood, OH<br>Cuyahoga County<br>OHSAA Division 1, Region 1</font></td></tr></table>
<table><tr><td colspan="6">St Edward 2002</td><td></td></tr>
<tr><td>8/24</td><td>H</td><td><a href="teams.jsp?teamID=1580&amp;year=2002">Ursuline<font color="#aa0011"> (8-6) </font></a></td><td>[4:13]</td><td>W</td><td>31-12</td><td></td></tr>
<tr><td>11/2</td><td>N</td><td><a href="teams.jsp?teamID=1588&amp;year=2002"><font color="#ff0022"># </font>Valley Forge<font color="#aa0011"> (8-3) </font></a></td><td>[1:1]</td><td>L</td><td>16-18</td><td>OT</td></tr>
</table></body></html>`
	ref := TeamRef{Season: 2002, TeamID: "1346", Name: "St Edward", URL: "https://joeeitel.com/hsfoot/teams.jsp?teamID=1346&year=2002"}

	team, games, opponents, err := parseTeamPage(strings.NewReader(html), ref)
	if err != nil {
		t.Fatal(err)
	}
	if team.Name != "St Edward" || team.Mascot != "Eagles" || team.City != "Lakewood" || team.State != "OH" || team.County != "Cuyahoga" {
		t.Fatalf("unexpected legacy team: %+v", team)
	}
	if team.PrimaryColor != "green" || team.SecondaryColor != "gold" || team.Division != "1" || team.Region != "1" {
		t.Fatalf("unexpected legacy metadata: %+v", team)
	}
	if len(games) != 2 || len(opponents) != 2 {
		t.Fatalf("got %d games and %d opponents", len(games), len(opponents))
	}
	if games[0].OpponentTeamID != "1580" || games[0].Result != "W" || games[0].Score != "31-12" {
		t.Fatalf("unexpected legacy game: %+v", games[0])
	}
	if games[1].HomeAway != "N" || games[1].Playoff != "#" || games[1].Notes != "OT" {
		t.Fatalf("unexpected legacy playoff game: %+v", games[1])
	}
	if opponents[1].Name != "Valley Forge" {
		t.Fatalf("unexpected legacy opponent: %+v", opponents[1])
	}
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
	}

	for _, test := range tests {
		t.Run(test.displayName, func(t *testing.T) {
			if got := parseMascot(test.name, test.displayName); got != test.want {
				t.Fatalf("parseMascot(%q, %q) = %q, want %q", test.name, test.displayName, got, test.want)
			}
		})
	}
}
