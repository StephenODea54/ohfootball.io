package pipeline

import (
	"errors"
	"fmt"
	"sync/atomic"

	"github.com/StephenODea54/services/scraper/internal/joeeitel"
)

// MaxEmptyTeamPages is the largest number of empty team pages that one season
// can hold and still succeed. The count includes the pages of the opponents.
//
// A season lists about 700 OHSAA teams and about 60 opponents. The site can
// lose the page of a team, so a few empty pages are teams that the site has no
// data for. A site that is broken answers most pages empty, so a
// small limit catches it well before the season ends. A fixed number is used
// and not a share of the teams, because the seasons are close in size.
const MaxEmptyTeamPages = 5

// ErrTooManyEmptyTeamPages reports a season with more empty team pages than
// MaxEmptyTeamPages. So many empty pages point at a broken site, and not at a
// few teams that the site has no data for.
var ErrTooManyEmptyTeamPages = errors.New("too many team pages of the season are empty")

// emptyPages counts the empty team pages of one season. The workers of both
// team passes share it.
type emptyPages struct {
	count atomic.Int64
}

// add counts one empty page. It returns an error when the count goes above
// the limit.
func (e *emptyPages) add(ref joeeitel.TeamRef) error {
	if count := e.count.Add(1); count > MaxEmptyTeamPages {
		return fmt.Errorf("team %s at %s is empty page %d, and the limit is %d: %w",
			ref.Key(), ref.URL, count, MaxEmptyTeamPages, ErrTooManyEmptyTeamPages)
	}
	return nil
}

func (e *emptyPages) total() int {
	return int(e.count.Load())
}

// ohioState is the state of every OHSAA team. The site writes it this way on
// the pages that it has.
const ohioState = "OH"

// placeholderTeam is the team row for an empty page. It holds the identifier,
// the name of the link that led to the page, and the given state, and nothing
// else.
func placeholderTeam(ref joeeitel.TeamRef, state string) joeeitel.Team {
	return joeeitel.Team{
		Season: ref.Season,
		TeamID: ref.TeamID,
		Name:   joeeitel.CleanText(ref.Name),
		State:  state,
	}
}
