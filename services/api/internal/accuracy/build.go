package accuracy

import "github.com/StephenODea54/services/api/graph/model"

// Report gives the report of one season. Its list of the upsets of the last week is empty. The
// store fills it, because the list needs a query of its own.
func Report(cells []Cell, pending []Pending, season int) *model.SeasonReport {
	weeks := SeasonWeeks(cells, pending, season)
	return &model.SeasonReport{
		Season:         season,
		Weeks:          weeks,
		LastWeek:       LastWeek(weeks),
		LastWeekUpsets: []*model.ScoredGame{},
	}
}

// Assemble builds the answer of the modelAccuracy query. seasons and current are not cut to the
// range. Every other view is.
func Assemble(
	cells []Cell,
	pending []Pending,
	current int,
	r Range,
	upsets []*model.ScoredGame,
	report *model.SeasonReport,
) *model.ModelAccuracy {
	inRange := InRange(cells, r)
	return &model.ModelAccuracy{
		CurrentSeason: current,
		FromSeason:    r.From,
		Overall:       Score(inRange),
		Seasons:       BySeason(cells, pending, current),
		Phases:        ByPhase(inRange),
		Confidence:    Confidence(inRange),
		Upsets:        upsets,
		WorstWeeks:    WorstWeeks(inRange, pending, ListLimit),
		Current:       report,
	}
}
