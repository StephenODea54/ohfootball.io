package accuracy

import "github.com/StephenODea54/services/api/graph/model"

// Report gives the report of one season. Its lists of the upsets and of the exact margins of the
// last week are empty. The store fills them, because each list needs a query of its own.
func Report(cells []Cell, pending []Pending, season int) *model.SeasonReport {
	weeks := SeasonWeeks(cells, pending, season)
	return &model.SeasonReport{
		Season:                   season,
		Weeks:                    weeks,
		LastWeek:                 LastWeek(weeks),
		LastWeekUpsets:           []*model.ScoredGame{},
		LastWeekExactMarginGames: []*model.ScoredGame{},
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
	exactMarginGames []*model.ScoredGame,
	report *model.SeasonReport,
) *model.ModelAccuracy {
	inRange := InRange(cells, r)
	return &model.ModelAccuracy{
		CurrentSeason:    current,
		FromSeason:       r.From,
		Overall:          Score(inRange),
		Seasons:          BySeason(cells, pending, current),
		Phases:           ByPhase(inRange),
		Confidence:       Confidence(inRange),
		Upsets:           upsets,
		ExactMarginGames: exactMarginGames,
		WorstWeeks:       WorstWeeks(inRange, pending, ListLimit),
		Current:          report,
	}
}
