package pipeline

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"

	"github.com/StephenODea54/services/scraper/internal/joeeitel"
	"github.com/StephenODea54/services/scraper/internal/joeeitel/teampage"
)

// Getter fetches one page. The fetch package satisfies it. A test satisfies it
// with saved pages, so the pipeline tests make no network request.
type Getter interface {
	Get(ctx context.Context, url string) ([]byte, error)
}

// Runner reads seasons from one site.
type Runner struct {
	Client  Getter
	Workers int
	BaseURL string

	// Logger receives a warning for each empty team page. A nil Logger uses
	// the default logger.
	Logger *slog.Logger
}

// Summary counts what one season run stored. It holds no error field, because
// any error stops the season, so a Summary always describes a complete run.
type Summary struct {
	Season              int
	Regions             int
	OHSAATeams          int
	OpponentsDiscovered int
	OpponentsScraped    int
	GameRows            int

	// EmptyTeamPages counts the team pages that held only white space. Those
	// teams are also in OHSAATeams or OpponentsScraped.
	EmptyTeamPages int
}

// teamPage is what one team page worker reports back.
type teamPage struct {
	ref       joeeitel.TeamRef
	opponents []joeeitel.TeamRef
	rows      int

	// empty is true for a page that held only white space. The worker wrote
	// nothing for it, and the caller decides whether the team needs a row.
	empty bool
}

// ListSeasons returns every season the site lists, in order.
//
// An empty list is an error. The index page always lists seasons, so an empty
// list means the page changed. Without this test the program would do nothing
// and still report success.
func (r *Runner) ListSeasons(ctx context.Context) ([]int, error) {
	indexURL := joeeitel.SeasonIndexURL(r.BaseURL)
	body, err := r.Client.Get(ctx, indexURL)
	if err != nil {
		return nil, fmt.Errorf("fetch the season index: %w", err)
	}
	doc, base, err := joeeitel.NewDocument(body, indexURL)
	if err != nil {
		return nil, err
	}

	seasons := joeeitel.ParseSeasons(doc, base)
	if len(seasons) == 0 {
		return nil, fmt.Errorf("the season index at %s lists no season", indexURL)
	}
	return seasons, nil
}

// Season reads one season and writes every team page through sink.
//
// Any error stops the season. The pages that were already written stay in the
// database, and the caller marks the run failed.
//
// An empty team page is not an error. The site has no data for that team, so
// the run skips the page and counts it. A team that a schedule of the run
// names still gets a row with its identifier and name, so every game row of
// the run names a team that the run holds. More empty pages than
// MaxEmptyTeamPages stop the season.
//
// The stages are: read the season page, read every region page for its team
// links, read every OHSAA team page, and then read the page of every opponent
// that is not an OHSAA team. The opponent pass reads metadata only. Following
// the schedules of those opponents would make the crawler leave Ohio.
func (r *Runner) Season(ctx context.Context, season int, sink Sink) (Summary, error) {
	seasonURL := joeeitel.SeasonURL(r.BaseURL, season)
	body, err := r.Client.Get(ctx, seasonURL)
	if err != nil {
		return Summary{}, fmt.Errorf("fetch season %d: %w", season, err)
	}
	doc, base, err := joeeitel.NewDocument(body, seasonURL)
	if err != nil {
		return Summary{}, err
	}

	regions := joeeitel.ParseRegionLinks(doc, base, season)
	if len(regions) == 0 {
		return Summary{}, fmt.Errorf("the page of season %d lists no region", season)
	}

	regionTeams, err := FanOut(ctx, r.Workers, regions,
		func(ctx context.Context, regionURL string) ([]joeeitel.TeamRef, error) {
			return r.regionTeams(ctx, regionURL, season)
		})
	if err != nil {
		return Summary{}, err
	}
	ohsaaRefs := mergeRefs(regionTeams)
	var empty emptyPages

	pages, err := FanOut(ctx, r.Workers, ohsaaRefs,
		func(ctx context.Context, ref joeeitel.TeamRef) (teamPage, error) {
			return r.writeTeamPage(ctx, ref, sink, true, &empty)
		})
	if err != nil {
		return Summary{}, err
	}

	discovered := make([][]joeeitel.TeamRef, 0, len(pages))
	gameRows := 0
	for _, page := range pages {
		discovered = append(discovered, page.opponents)
		gameRows += page.rows
	}
	discoveredRefs := mergeRefs(discovered)

	if err := writeNamedPlaceholders(ctx, sink, pages, discoveredRefs); err != nil {
		return Summary{}, err
	}

	// Each opponent came from a schedule, so an empty opponent page always
	// gets a row.
	opponents := PartitionOpponents(ohsaaRefs, discoveredRefs)
	_, err = FanOut(ctx, r.Workers, opponents,
		func(ctx context.Context, ref joeeitel.TeamRef) (struct{}, error) {
			page, err := r.writeTeamPage(ctx, ref, sink, false, &empty)
			if err == nil && page.empty {
				err = writePlaceholder(ctx, sink, placeholderTeam(ref, ""))
			}
			return struct{}{}, err
		})
	if err != nil {
		return Summary{}, err
	}

	return Summary{
		Season:              season,
		Regions:             len(regions),
		OHSAATeams:          len(ohsaaRefs),
		OpponentsDiscovered: len(opponents),
		OpponentsScraped:    len(opponents),
		GameRows:            gameRows,
		EmptyTeamPages:      empty.total(),
	}, nil
}

// writeNamedPlaceholders writes a row for each OHSAA team with an empty page
// that a schedule of the run names. Without that row, a game row of the run
// can name a team that no successful run holds, and the marts fail their
// relationship tests. An empty page that no schedule names gets no row.
//
// The team came from a region list of the OHSAA, so its row holds the state
// of Ohio. The rating and the API read only teams of Ohio, and a row with no
// state would drop the team and its games from both. The name comes from the
// region list. When that link has no text, the name comes from the schedule
// link, because a team row must have a name.
func writeNamedPlaceholders(ctx context.Context, sink Sink, pages []teamPage, discovered []joeeitel.TeamRef) error {
	named := make(map[string]joeeitel.TeamRef, len(discovered))
	for _, ref := range discovered {
		named[ref.Key()] = ref
	}
	for _, page := range pages {
		scheduleRef, isNamed := named[page.ref.Key()]
		if !page.empty || !isNamed {
			continue
		}
		team := placeholderTeam(page.ref, ohioState)
		if team.Name == "" {
			team.Name = joeeitel.CleanText(scheduleRef.Name)
		}
		if err := writePlaceholder(ctx, sink, team); err != nil {
			return err
		}
	}
	return nil
}

func writePlaceholder(ctx context.Context, sink Sink, team joeeitel.Team) error {
	if err := sink.WriteTeam(ctx, team, nil); err != nil {
		return fmt.Errorf("write team %d:%s: %w", team.Season, team.TeamID, err)
	}
	return nil
}

// regionTeams reads one region page for the teams it lists.
func (r *Runner) regionTeams(ctx context.Context, regionURL string, season int) ([]joeeitel.TeamRef, error) {
	body, err := r.Client.Get(ctx, regionURL)
	if err != nil {
		return nil, fmt.Errorf("fetch region %s: %w", regionURL, err)
	}
	doc, base, err := joeeitel.NewDocument(body, regionURL)
	if err != nil {
		return nil, err
	}

	teams := joeeitel.ParseTeamLinks(doc, base, season)
	if len(teams) == 0 {
		return nil, fmt.Errorf("the region page %s lists no team", regionURL)
	}
	return teams, nil
}

// writeTeamPage reads one team page and hands it to the sink. It returns the
// opponents of that team, so the caller can read their pages next.
//
// withSchedule is false for an opponent. An opponent supplies metadata only,
// and its own schedule belongs to the season of another association.
//
// An empty page writes nothing and is counted in empty. The client can report
// it as an error that wraps joeeitel.ErrEmptyPage, or return the empty body
// when it does not check bodies.
func (r *Runner) writeTeamPage(ctx context.Context, ref joeeitel.TeamRef, sink Sink,
	withSchedule bool, empty *emptyPages) (teamPage, error) {
	body, err := r.Client.Get(ctx, ref.URL)
	if errors.Is(err, joeeitel.ErrEmptyPage) || (err == nil && joeeitel.IsEmptyPage(body)) {
		if err := empty.add(ref); err != nil {
			return teamPage{}, err
		}
		r.logger().Warn("the team page is empty, so the crawler skips it",
			"team", ref.Key(), "url", ref.URL)
		return teamPage{ref: ref, empty: true}, nil
	}
	if err != nil {
		return teamPage{}, fmt.Errorf("fetch team %s: %w", ref.Key(), err)
	}
	doc, base, err := joeeitel.NewDocument(body, ref.URL)
	if err != nil {
		return teamPage{}, err
	}

	team, rows, opponents, err := teampage.Parse(doc, base, ref)
	if err != nil {
		return teamPage{}, fmt.Errorf("parse team %s: %w", ref.Key(), err)
	}
	if !withSchedule {
		rows, opponents = nil, nil
	}

	if err := sink.WriteTeam(ctx, team, rows); err != nil {
		return teamPage{}, fmt.Errorf("write team %s: %w", ref.Key(), err)
	}
	return teamPage{ref: ref, opponents: opponents, rows: len(rows)}, nil
}

func (r *Runner) logger() *slog.Logger {
	if r.Logger == nil {
		return slog.Default()
	}
	return r.Logger
}

// PartitionOpponents returns the discovered teams that are not OHSAA teams.
//
// The result holds no duplicates. One school appears on the schedule of every
// team it played, so the same opponent arrives many times. Without this the
// crawler would read that page once for each mention and write one row for
// each read, which breaks the rule that a run holds one row for each team.
func PartitionOpponents(ohsaa, discovered []joeeitel.TeamRef) []joeeitel.TeamRef {
	ohsaaKeys := make(map[string]struct{}, len(ohsaa))
	for _, ref := range ohsaa {
		ohsaaKeys[ref.Key()] = struct{}{}
	}

	seen := make(map[string]struct{}, len(discovered))
	opponents := make([]joeeitel.TeamRef, 0, len(discovered))
	for _, ref := range discovered {
		if _, isOHSAA := ohsaaKeys[ref.Key()]; isOHSAA {
			continue
		}
		if _, repeated := seen[ref.Key()]; repeated {
			continue
		}
		seen[ref.Key()] = struct{}{}
		opponents = append(opponents, ref)
	}

	slices.SortFunc(opponents, joeeitel.CompareTeamRefs)
	return opponents
}

// mergeRefs joins the lists that the workers returned into one sorted list
// without duplicates. Regions overlap, and so do the schedules of teams.
func mergeRefs(lists [][]joeeitel.TeamRef) []joeeitel.TeamRef {
	seen := make(map[string]struct{})
	var refs []joeeitel.TeamRef
	for _, list := range lists {
		for _, ref := range list {
			if _, repeated := seen[ref.Key()]; repeated {
				continue
			}
			seen[ref.Key()] = struct{}{}
			refs = append(refs, ref)
		}
	}

	slices.SortFunc(refs, joeeitel.CompareTeamRefs)
	return refs
}
