package pipeline

import (
	"context"

	"github.com/StephenODea54/services/scraper/internal/joeeitel"
)

// Sink receives the result of one team page.
//
// One call is one unit of work. The store makes it one transaction as well, so
// a page is stored whole or not at all. A test supplies a sink that keeps the
// pages in memory.
type Sink interface {
	WriteTeam(ctx context.Context, team joeeitel.Team, rows []joeeitel.TeamScheduleRow) error

	// WriteOpponent writes the page of an opponent that is not an OHSAA team.
	// Its schedule rows go apart from the rows of the OHSAA teams, so they do
	// not become canonical games.
	WriteOpponent(ctx context.Context, team joeeitel.Team, rows []joeeitel.TeamScheduleRow) error
}
