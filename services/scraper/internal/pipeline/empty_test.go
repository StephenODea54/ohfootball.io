package pipeline

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"testing"

	"github.com/StephenODea54/services/scraper/internal/joeeitel"
)

// addEmptyTeams adds a third region to the test site. The region lists the
// given teams, and the page of each one is empty.
func addEmptyTeams(getter *stubGetter, season int, ids ...string) {
	getter.pages[joeeitel.SeasonURL(testBase, season)] = fmt.Sprintf(
		`<html><body><a href="%s">one</a><a href="%s">two</a><a href="%s">three</a></body></html>`,
		regionURL(1, season), regionURL(2, season), regionURL(3, season))

	var links strings.Builder
	for _, id := range ids {
		fmt.Fprintf(&links, `<a href="%s">Team %s</a>`, teamURL(id, season), id)
		getter.pages[teamURL(id, season)] = "\n\n\n\n"
	}
	getter.pages[regionURL(3, season)] = "<html><body>" + links.String() + "</body></html>"
}

// teamByID returns the stored team with the given identifier.
func (m *memorySink) teamByID(id string) (joeeitel.Team, bool) {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	for _, team := range m.teams {
		if team.TeamID == id {
			return team, true
		}
	}
	return joeeitel.Team{}, false
}

func emptyIDs(count int) []string {
	ids := make([]string, count)
	for i := range ids {
		ids[i] = fmt.Sprintf("%d", 200+i)
	}
	return ids
}

func TestSeasonSkipsAnEmptyTeamPage(t *testing.T) {
	bodies := map[string]string{
		"no body":                        "",
		"new lines only":                 "\n\n\n\n",
		"spaces, tabs and line endings":  " \t\r\n \t\r\n",
		"a no-break space and new lines": " \n\n",
	}

	for name, body := range bodies {
		t.Run(name, func(t *testing.T) {
			getter := newTestSite(2025)
			getter.pages[teamURL("3", 2025)] = body
			sink := &memorySink{}
			var logs bytes.Buffer
			runner := newRunner(getter)
			runner.Logger = slog.New(slog.NewTextHandler(&logs, nil))

			summary, err := runner.Season(context.Background(), 2025, sink)
			if err != nil {
				t.Fatalf("Season returned %v", err)
			}

			// No schedule names team 3, so it gets no row. Its only opponent,
			// team 91, is not discovered either.
			if got, want := sink.teamIDs(), []string{"1", "2", "90"}; !slices.Equal(got, want) {
				t.Errorf("stored teams %v, want %v", got, want)
			}
			if summary.EmptyTeamPages != 1 {
				t.Errorf("summary counts %d empty team pages, want 1", summary.EmptyTeamPages)
			}
			if summary.OHSAATeams != 3 || summary.OpponentsScraped != 1 || summary.GameRows != 4 {
				t.Errorf("summary is %+v, want 3 OHSAA teams, 1 opponent and 4 game rows", summary)
			}

			line := logs.String()
			for _, want := range []string{"level=WARN", "team=2025:3", teamURL("3", 2025)} {
				if !strings.Contains(line, want) {
					t.Errorf("log %q does not contain %q", line, want)
				}
			}
		})
	}
}

// The fetch client rejects an empty body, retries, and then reports the
// rejection as an error. The run treats that error as an empty page.
func TestSeasonSkipsATeamPageThatTheClientRejectsAsEmpty(t *testing.T) {
	getter := newTestSite(2025)
	getter.fail[teamURL("3", 2025)] = fmt.Errorf("the body was rejected: %w", joeeitel.ErrEmptyPage)
	sink := &memorySink{}

	summary, err := newRunner(getter).Season(context.Background(), 2025, sink)
	if err != nil {
		t.Fatalf("Season returned %v", err)
	}
	if summary.EmptyTeamPages != 1 {
		t.Errorf("summary counts %d empty team pages, want 1", summary.EmptyTeamPages)
	}
	if _, stored := sink.teamByID("3"); stored {
		t.Error("the run stored a row for an empty page that no schedule names")
	}
}

// setRegionOneNames replaces the first region page. The link of team 2 holds
// the given text, and the schedule of team 1 still names it "Team 2".
func setRegionOneNames(getter *stubGetter, teamTwoText string) {
	getter.pages[regionURL(1, 2025)] = fmt.Sprintf(
		`<html><body><a href="%s">Team 1</a><a href="%s">%s</a></body></html>`,
		teamURL("1", 2025), teamURL("2", 2025), teamTwoText)
}

// Team 1 names team 2 on its schedule. If the page of team 2 is empty, team 2
// still needs a row, or the game row of team 1 names a team that the run does
// not hold. The row holds the state of Ohio, because the rating and the API
// read only teams of Ohio.
func TestSeasonWritesAPlaceholderForAnEmptyTeamThatAScheduleNames(t *testing.T) {
	getter := newTestSite(2025)
	setRegionOneNames(getter, "Region Two")
	getter.pages[teamURL("2", 2025)] = "\n"
	sink := &memorySink{}

	summary, err := newRunner(getter).Season(context.Background(), 2025, sink)
	if err != nil {
		t.Fatalf("Season returned %v", err)
	}

	team, stored := sink.teamByID("2")
	want := joeeitel.Team{Season: 2025, TeamID: "2", Name: "Region Two", State: "OH"}
	if !stored || team != want {
		t.Errorf("stored team 2 is %+v (stored %v), want %+v", team, stored, want)
	}
	if got, want := sink.teamIDs(), []string{"1", "2", "3", "90", "91"}; !slices.Equal(got, want) {
		t.Errorf("stored teams %v, want %v", got, want)
	}
	// Team 1 has two rows and team 3 has one. Team 2 has none.
	if summary.GameRows != 3 || len(sink.rows) != 3 {
		t.Errorf("summary counts %d rows and the sink holds %d, want 3", summary.GameRows, len(sink.rows))
	}
	if summary.EmptyTeamPages != 1 {
		t.Errorf("summary counts %d empty team pages, want 1", summary.EmptyTeamPages)
	}
}

// A team row must have a name. When the link of the region list has no text,
// the name comes from the schedule link that named the team.
func TestSeasonNamesAPlaceholderFromTheScheduleWhenTheRegionLinkHasNoText(t *testing.T) {
	getter := newTestSite(2025)
	setRegionOneNames(getter, " ")
	getter.pages[teamURL("2", 2025)] = "\n"
	sink := &memorySink{}

	if _, err := newRunner(getter).Season(context.Background(), 2025, sink); err != nil {
		t.Fatalf("Season returned %v", err)
	}

	team, stored := sink.teamByID("2")
	want := joeeitel.Team{Season: 2025, TeamID: "2", Name: "Team 2", State: "OH"}
	if !stored || team != want {
		t.Errorf("stored team 2 is %+v (stored %v), want %+v", team, stored, want)
	}
}

// An opponent need not be a team of Ohio, so its row holds no state.
func TestSeasonWritesAPlaceholderForAnEmptyOpponentPage(t *testing.T) {
	getter := newTestSite(2025)
	getter.pages[teamURL("91", 2025)] = "  \n"
	sink := &memorySink{}

	summary, err := newRunner(getter).Season(context.Background(), 2025, sink)
	if err != nil {
		t.Fatalf("Season returned %v", err)
	}

	team, stored := sink.teamByID("91")
	want := joeeitel.Team{Season: 2025, TeamID: "91", Name: "Team 91"}
	if !stored || team != want {
		t.Errorf("stored team 91 is %+v (stored %v), want %+v", team, stored, want)
	}
	if summary.EmptyTeamPages != 1 || summary.OpponentsScraped != 2 {
		t.Errorf("summary is %+v, want 1 empty team page and 2 opponents", summary)
	}
}

func TestSeasonStopsWhenAPlaceholderCannotBeWritten(t *testing.T) {
	tests := []struct {
		name  string
		empty string
	}{
		{name: "an OHSAA team", empty: "2"},
		{name: "an opponent", empty: "91"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			getter := newTestSite(2025)
			getter.pages[teamURL(test.empty, 2025)] = "\n"
			sink := &memorySink{failTeam: test.empty}

			_, err := newRunner(getter).Season(context.Background(), 2025, sink)
			if err == nil || !strings.Contains(err.Error(), "write team 2025:"+test.empty) {
				t.Errorf("Season returned %v, want an error that names the write of team %s", err, test.empty)
			}
		})
	}
}

func TestSeasonAcceptsEmptyTeamPagesUpToTheLimit(t *testing.T) {
	getter := newTestSite(2025)
	addEmptyTeams(getter, 2025, emptyIDs(MaxEmptyTeamPages)...)

	summary, err := newRunner(getter).Season(context.Background(), 2025, &memorySink{})
	if err != nil {
		t.Fatalf("Season returned %v", err)
	}
	if summary.EmptyTeamPages != MaxEmptyTeamPages {
		t.Errorf("summary counts %d empty team pages, want %d", summary.EmptyTeamPages, MaxEmptyTeamPages)
	}
	if summary.OHSAATeams != 3+MaxEmptyTeamPages {
		t.Errorf("summary counts %d OHSAA teams, want %d", summary.OHSAATeams, 3+MaxEmptyTeamPages)
	}
}

func TestSeasonStopsAboveTheLimitOfEmptyTeamPages(t *testing.T) {
	tests := []struct {
		name  string
		build func(*stubGetter)
	}{
		{
			name:  "OHSAA teams only",
			build: func(g *stubGetter) { addEmptyTeams(g, 2025, emptyIDs(MaxEmptyTeamPages+1)...) },
		},
		{
			// The opponent pass shares the count of the OHSAA pass.
			name: "OHSAA teams and one opponent",
			build: func(g *stubGetter) {
				addEmptyTeams(g, 2025, emptyIDs(MaxEmptyTeamPages)...)
				g.pages[teamURL("91", 2025)] = "\n"
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			getter := newTestSite(2025)
			test.build(getter)

			_, err := newRunner(getter).Season(context.Background(), 2025, &memorySink{})
			if !errors.Is(err, ErrTooManyEmptyTeamPages) {
				t.Fatalf("Season returned %v, want %v", err, ErrTooManyEmptyTeamPages)
			}
			if !strings.Contains(err.Error(), "teams.jsp?teamID=") {
				t.Errorf("error %q does not name the URL of the page", err)
			}
		})
	}
}

func TestEmptyPagesAdd(t *testing.T) {
	var empty emptyPages
	ref := joeeitel.TeamRef{Season: 2001, TeamID: "200", URL: teamURL("200", 2001)}

	for count := 1; count <= MaxEmptyTeamPages; count++ {
		if err := empty.add(ref); err != nil {
			t.Fatalf("add %d returned %v", count, err)
		}
	}
	err := empty.add(ref)
	if !errors.Is(err, ErrTooManyEmptyTeamPages) {
		t.Fatalf("add above the limit returned %v", err)
	}
	if !strings.Contains(err.Error(), "2001:200") {
		t.Errorf("error %q does not name the team", err)
	}
	if empty.total() != MaxEmptyTeamPages+1 {
		t.Errorf("total is %d, want %d", empty.total(), MaxEmptyTeamPages+1)
	}
}

func TestPlaceholderTeamCleansTheName(t *testing.T) {
	ref := joeeitel.TeamRef{Season: 2001, TeamID: "200", Name: "  Berea \n", URL: teamURL("200", 2001)}
	want := joeeitel.Team{Season: 2001, TeamID: "200", Name: "Berea", State: "OH"}
	if got := placeholderTeam(ref, "OH"); got != want {
		t.Errorf("placeholderTeam is %+v, want %+v", got, want)
	}
}
