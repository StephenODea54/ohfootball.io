// Package accuracy folds groups of scored predictions into the views of the modelAccuracy query.
// The store sums the predictions into cells in SQL, and this package does the rest of the math, so
// the math is tested without a database.
package accuracy

import (
	"fmt"

	"github.com/StephenODea54/services/api/graph/model"
)

// Cell is one group of scored predictions: one season, week, playoff flag, and confidence bin.
type Cell struct {
	Season  int
	Week    int
	Playoff bool
	// Bin is 0 for a favorite probability from 50% to 55%, 1 for 55% to 60%, and so on up to 9 for
	// 95% and up.
	Bin     int
	Games   int
	Ties    int
	Decided int
	Correct int
	// SumSquaredError and SumLogLoss are the sums of the Brier score and the log loss of each game.
	SumSquaredError float64
	SumLogLoss      float64
	// SumFavoriteProbability is the sum over every game of the cell, and
	// SumFavoriteProbabilityDecided is the sum over the decided games only.
	SumFavoriteProbability        float64
	SumFavoriteProbabilityDecided float64
	// FirstDate and LastDate are the dates of the first and the last game, as YYYY-MM-DD.
	FirstDate string
	LastDate  string
}

// Pending is the number of predicted games without a result in one week of one season.
type Pending struct {
	Season int
	Week   int
	Games  int
}

// Range is the first and the last season of the views that are cut to a range.
type Range struct {
	From int
	To   int
}

const (
	// MinWorstWeekGames is the fewest games that a week needs to enter the worst weeks.
	MinWorstWeekGames = 100
	// Bins is the number of confidence bins. Each bin is five points wide.
	Bins = 10
	// ListLimit is the length of the list of upsets and of the list of worst weeks.
	ListLimit = 10
	// LastWeekUpsets is the length of the list of upsets of the last week.
	LastWeekUpsets = 5
	// FirstScoredSeason is the default first season of the range. From 2000 on, the scores come
	// from one source and every season has overtime. The site scores the same range.
	FirstScoredSeason = 2000
	// Last weeks of each phase of the regular season.
	lastEarlyWeek = 3
	lastMidWeek   = 7
)

// Phase gives the phase of a game. A playoff game is in PLAYOFF, whatever its week.
func Phase(week int, playoff bool) model.SeasonPhase {
	switch {
	case playoff:
		return model.SeasonPhasePlayoff
	case week <= lastEarlyWeek:
		return model.SeasonPhaseEarly
	case week <= lastMidWeek:
		return model.SeasonPhaseMid
	default:
		return model.SeasonPhaseLate
	}
}

// InRange keeps the cells whose season is in the range, both ends included.
func InRange(cells []Cell, r Range) []Cell {
	kept := make([]Cell, 0, len(cells))
	for _, cell := range cells {
		if cell.Season >= r.From && cell.Season <= r.To {
			kept = append(kept, cell)
		}
	}
	return kept
}

// ResolveRange applies the defaults of the range. to defaults to the current season. from
// defaults to FirstScoredSeason, or to to when to is earlier. It fails when from is after to.
func ResolveRange(current int, from, to *int) (Range, error) {
	r := Range{To: current}
	if to != nil {
		r.To = *to
	}
	r.From = min(FirstScoredSeason, r.To)
	if from != nil {
		r.From = *from
	}
	if r.From > r.To {
		return Range{}, fmt.Errorf("fromSeason %d is after toSeason %d", r.From, r.To)
	}
	return r, nil
}
