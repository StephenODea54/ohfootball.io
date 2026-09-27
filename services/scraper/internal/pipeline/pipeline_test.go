package pipeline

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/StephenODea54/services/scraper/internal/joeeitel"
)

// stubGetter answers from a map of saved pages. It counts the calls, so a test
// can assert that the crawler read a page once.
type stubGetter struct {
	mutex sync.Mutex
	pages map[string]string
	calls map[string]int
	fail  map[string]error
}

func newStubGetter() *stubGetter {
	return &stubGetter{
		pages: make(map[string]string),
		calls: make(map[string]int),
		fail:  make(map[string]error),
	}
}

func (s *stubGetter) Get(_ context.Context, pageURL string) ([]byte, error) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	s.calls[pageURL]++

	if err, ok := s.fail[pageURL]; ok {
		return nil, err
	}
	page, ok := s.pages[pageURL]
	if !ok {
		return nil, fmt.Errorf("no page at %s", pageURL)
	}
	return []byte(page), nil
}

func (s *stubGetter) callCount(pageURL string) int {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	return s.calls[pageURL]
}

// memorySink keeps the pages a run wrote. err fails every write, and failTeam
// fails the write of one team only.
type memorySink struct {
	mutex    sync.Mutex
	teams    []joeeitel.Team
	rows     []joeeitel.TeamScheduleRow
	err      error
	failTeam string
}

func (m *memorySink) WriteTeam(_ context.Context, team joeeitel.Team, rows []joeeitel.TeamScheduleRow) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	if m.err != nil {
		return m.err
	}
	if m.failTeam != "" && team.TeamID == m.failTeam {
		return errors.New("the database refused the team")
	}
	m.teams = append(m.teams, team)
	m.rows = append(m.rows, rows...)
	return nil
}

func (m *memorySink) teamIDs() []string {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	ids := make([]string, 0, len(m.teams))
	for _, team := range m.teams {
		ids = append(ids, team.TeamID)
	}
	slices.Sort(ids)
	return ids
}

const testBase = "https://joeeitel.com"

func teamURL(teamID string, season int) string {
	return fmt.Sprintf("%s/hsfoot/teams.jsp?teamID=%s&year=%d", testBase, teamID, season)
}

func regionURL(index, season int) string {
	return fmt.Sprintf("%s/hsfoot/rankings/%d/region-%d", testBase, season, index)
}

// teamPageHTML builds a modern team page whose schedule names the given
// opponents.
func teamPageHTML(season int, name string, opponentIDs ...string) string {
	var rows strings.Builder
	for _, id := range opponentIDs {
		fmt.Fprintf(&rows, `<tr><td class="gameDate">8/30</td><td class="homeAway">H</td>`+
			`<td class="opponent"><a class="teamLink" href="teams.jsp?teamID=%s&amp;year=%d">Team %s</a></td>`+
			`<td class="result">W</td><td class="score">7-0</td><td class="resultNote"></td></tr>`, id, season, id)
	}
	return fmt.Sprintf(`<html><body>
<div id="header" style="background-color:#111;color:#eee"><h2>%s Tigers</h2><h4><br>Springfield, OH<br></h4></div>
<table class="schedule"><caption><strong>%d %s Football (1-0)</strong><br>Division I, Region 1</caption>
<tbody>%s</tbody></table></body></html>`, name, season, name, rows.String())
}

// newTestSite builds a season with two regions, three OHSAA teams, and two
// teams from outside the association. Team 1 and team 2 share opponent 90.
func newTestSite(season int) *stubGetter {
	getter := newStubGetter()
	getter.pages[joeeitel.SeasonIndexURL(testBase)] = `<html><body>
<a href="seasons.jsp?year=2024">2024</a><a href="seasons.jsp?year=2025">2025</a></body></html>`

	getter.pages[joeeitel.SeasonURL(testBase, season)] = fmt.Sprintf(
		`<html><body><a href="%s">one</a><a href="%s">two</a></body></html>`,
		regionURL(1, season), regionURL(2, season))

	getter.pages[regionURL(1, season)] = fmt.Sprintf(
		`<html><body><a href="%s">Team 1</a><a href="%s">Team 2</a></body></html>`,
		teamURL("1", season), teamURL("2", season))
	getter.pages[regionURL(2, season)] = fmt.Sprintf(
		`<html><body><a href="%s">Team 3</a></body></html>`, teamURL("3", season))

	getter.pages[teamURL("1", season)] = teamPageHTML(season, "One", "2", "90")
	getter.pages[teamURL("2", season)] = teamPageHTML(season, "Two", "1", "90")
	getter.pages[teamURL("3", season)] = teamPageHTML(season, "Three", "91")
	getter.pages[teamURL("90", season)] = teamPageHTML(season, "Ninety", "99")
	getter.pages[teamURL("91", season)] = teamPageHTML(season, "NinetyOne", "99")
	return getter
}

func newRunner(getter Getter) *Runner {
	return &Runner{Client: getter, Workers: 3, BaseURL: testBase}
}

func TestSeasonReadsEveryTeamAndStopsAtTheOpponents(t *testing.T) {
	getter := newTestSite(2025)
	sink := &memorySink{}

	summary, err := newRunner(getter).Season(context.Background(), 2025, sink)
	if err != nil {
		t.Fatalf("Season returned %v", err)
	}

	want := []string{"1", "2", "3", "90", "91"}
	if got := sink.teamIDs(); !slices.Equal(got, want) {
		t.Errorf("stored teams %v, want %v", got, want)
	}
	if summary.Regions != 2 || summary.OHSAATeams != 3 {
		t.Errorf("summary counts regions=%d ohsaa=%d, want 2 and 3", summary.Regions, summary.OHSAATeams)
	}
	if summary.OpponentsDiscovered != 2 || summary.OpponentsScraped != 2 {
		t.Errorf("summary opponents are %d and %d, want 2 and 2",
			summary.OpponentsDiscovered, summary.OpponentsScraped)
	}
	// Two rows for team 1, two for team 2, one for team 3. An opponent stores
	// no rows at all.
	if summary.GameRows != 5 || len(sink.rows) != 5 {
		t.Errorf("summary counts %d rows and the sink holds %d, want 5", summary.GameRows, len(sink.rows))
	}

	// Team 99 is on the schedule of an opponent. The crawler must not read it.
	if count := getter.callCount(teamURL("99", 2025)); count != 0 {
		t.Errorf("the crawler read the page of team 99 %d times", count)
	}
}

// Team 1 and team 2 both name opponent 90. The crawler must read that page
// once, or the run stores the same team twice.
func TestSeasonReadsASharedOpponentOnce(t *testing.T) {
	getter := newTestSite(2025)
	sink := &memorySink{}

	if _, err := newRunner(getter).Season(context.Background(), 2025, sink); err != nil {
		t.Fatalf("Season returned %v", err)
	}
	if count := getter.callCount(teamURL("90", 2025)); count != 1 {
		t.Errorf("the crawler read the shared opponent %d times, want 1", count)
	}
	if count := strings.Count(strings.Join(sink.teamIDs(), ","), "90"); count != 1 {
		t.Errorf("the sink holds the shared opponent %d times, want 1", count)
	}
}

func TestSeasonStopsOnAnyError(t *testing.T) {
	tests := []struct {
		name      string
		breakSite func(*stubGetter)
		want      string
	}{
		{
			name:      "the season page cannot be read",
			breakSite: func(g *stubGetter) { g.fail[joeeitel.SeasonURL(testBase, 2025)] = errors.New("offline") },
			want:      "fetch season 2025",
		},
		{
			name: "the season page lists no region",
			breakSite: func(g *stubGetter) {
				g.pages[joeeitel.SeasonURL(testBase, 2025)] = `<html><body>nothing</body></html>`
			},
			want: "lists no region",
		},
		{
			name:      "a region page cannot be read",
			breakSite: func(g *stubGetter) { g.fail[regionURL(2, 2025)] = errors.New("offline") },
			want:      "fetch region",
		},
		{
			name: "a region page lists no team",
			breakSite: func(g *stubGetter) {
				g.pages[regionURL(2, 2025)] = `<html><body>nothing</body></html>`
			},
			want: "lists no team",
		},
		{
			name:      "a team page cannot be read",
			breakSite: func(g *stubGetter) { g.fail[teamURL("3", 2025)] = errors.New("offline") },
			want:      "fetch team",
		},
		{
			name:      "an opponent page cannot be read",
			breakSite: func(g *stubGetter) { g.fail[teamURL("91", 2025)] = errors.New("offline") },
			want:      "fetch team",
		},
		{
			name: "a team page is in no known format",
			breakSite: func(g *stubGetter) {
				g.pages[teamURL("3", 2025)] = `<html><body><p>a new design</p></body></html>`
			},
			want: "parse team",
		},
		{
			name: "a team page holds one character among the white space",
			breakSite: func(g *stubGetter) {
				g.pages[teamURL("3", 2025)] = "\n\n.\n\n"
			},
			want: "parse team",
		},
		{
			name: "an opponent page is in no known format",
			breakSite: func(g *stubGetter) {
				g.pages[teamURL("91", 2025)] = `<html><body><p>a new design</p></body></html>`
			},
			want: "parse team",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			getter := newTestSite(2025)
			test.breakSite(getter)

			_, err := newRunner(getter).Season(context.Background(), 2025, &memorySink{})
			if err == nil {
				t.Fatal("Season returned no error")
			}
			if !strings.Contains(err.Error(), test.want) {
				t.Errorf("error is %q, want it to contain %q", err, test.want)
			}
		})
	}
}

func TestSeasonStopsWhenTheSinkFails(t *testing.T) {
	sink := &memorySink{err: errors.New("the database is down")}

	_, err := newRunner(newTestSite(2025)).Season(context.Background(), 2025, sink)
	if err == nil {
		t.Fatal("Season returned no error")
	}
	if !strings.Contains(err.Error(), "write team") {
		t.Errorf("error is %q, want it to name the write", err)
	}
}

func TestWriteTeamPageFailsOnAnUnreadableTeamURL(t *testing.T) {
	getter := newStubGetter()
	getter.pages["://broken"] = `<html></html>`

	_, err := newRunner(getter).writeTeamPage(context.Background(),
		joeeitel.TeamRef{Season: 2025, TeamID: "5", URL: "://broken"}, &memorySink{}, true, &emptyPages{})
	if err == nil {
		t.Fatal("writeTeamPage returned no error for an unreadable URL")
	}
}

func TestListSeasons(t *testing.T) {
	getter := newTestSite(2025)

	seasons, err := newRunner(getter).ListSeasons(context.Background())
	if err != nil {
		t.Fatalf("ListSeasons returned %v", err)
	}
	if !slices.Equal(seasons, []int{2024, 2025}) {
		t.Errorf("seasons are %v, want [2024 2025]", seasons)
	}
}

func TestListSeasonsFailsOnAnEmptyIndex(t *testing.T) {
	getter := newTestSite(2025)
	getter.pages[joeeitel.SeasonIndexURL(testBase)] = `<html><body>no links</body></html>`

	_, err := newRunner(getter).ListSeasons(context.Background())
	if err == nil {
		t.Fatal("ListSeasons returned no error for an index with no season")
	}
	if !strings.Contains(err.Error(), "lists no season") {
		t.Errorf("error is %q", err)
	}
}

func TestListSeasonsFailsWhenTheIndexCannotBeRead(t *testing.T) {
	getter := newTestSite(2025)
	getter.fail[joeeitel.SeasonIndexURL(testBase)] = errors.New("offline")

	if _, err := newRunner(getter).ListSeasons(context.Background()); err == nil {
		t.Fatal("ListSeasons returned no error")
	}
}

func TestListSeasonsFailsOnAnUnreadableBaseURL(t *testing.T) {
	getter := newStubGetter()
	getter.pages[joeeitel.SeasonIndexURL("://broken")] = `<html></html>`
	runner := &Runner{Client: getter, Workers: 1, BaseURL: "://broken"}

	if _, err := runner.ListSeasons(context.Background()); err == nil {
		t.Fatal("ListSeasons returned no error for an unreadable base URL")
	}
}

func TestPartitionOpponents(t *testing.T) {
	ref := func(id string) joeeitel.TeamRef {
		return joeeitel.TeamRef{Season: 2025, TeamID: id, URL: teamURL(id, 2025)}
	}

	ohsaa := []joeeitel.TeamRef{ref("1"), ref("2")}
	discovered := []joeeitel.TeamRef{ref("2"), ref("90"), ref("90"), ref("1"), ref("91")}

	opponents := PartitionOpponents(ohsaa, discovered)
	if len(opponents) != 2 {
		t.Fatalf("got %d opponents, want 2", len(opponents))
	}
	if opponents[0].TeamID != "90" || opponents[1].TeamID != "91" {
		t.Errorf("opponents are %v", opponents)
	}
}

func TestPartitionOpponentsKeepsTheSameTeamOfAnotherSeason(t *testing.T) {
	ohsaa := []joeeitel.TeamRef{{Season: 2025, TeamID: "1"}}
	discovered := []joeeitel.TeamRef{{Season: 2024, TeamID: "1"}}

	if opponents := PartitionOpponents(ohsaa, discovered); len(opponents) != 1 {
		t.Errorf("got %d opponents, want 1, because the key holds the season", len(opponents))
	}
}

func TestMergeRefsRemovesDuplicatesAndSorts(t *testing.T) {
	lists := [][]joeeitel.TeamRef{
		{{Season: 2025, TeamID: "2"}, {Season: 2025, TeamID: "1"}},
		{{Season: 2025, TeamID: "2"}},
		nil,
	}

	refs := mergeRefs(lists)
	if len(refs) != 2 || refs[0].TeamID != "1" || refs[1].TeamID != "2" {
		t.Errorf("merged references are %v", refs)
	}
}

func TestSeasonFailsOnAnUnreadableBaseURL(t *testing.T) {
	getter := newStubGetter()
	getter.pages[joeeitel.SeasonURL("://broken", 2025)] = `<html></html>`
	runner := &Runner{Client: getter, Workers: 1, BaseURL: "://broken"}

	if _, err := runner.Season(context.Background(), 2025, &memorySink{}); err == nil {
		t.Fatal("Season returned no error for an unreadable base URL")
	}
}

func TestRegionTeamsFailsOnAnUnreadableRegionURL(t *testing.T) {
	getter := newStubGetter()
	getter.pages["://broken"] = `<html></html>`

	if _, err := newRunner(getter).regionTeams(context.Background(), "://broken", 2025); err == nil {
		t.Fatal("regionTeams returned no error for an unreadable URL")
	}
}
