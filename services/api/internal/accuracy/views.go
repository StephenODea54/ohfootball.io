package accuracy

import (
	"cmp"
	"slices"

	"github.com/StephenODea54/services/api/graph/model"
)

// groupBy puts the cells in groups by key.
func groupBy[K comparable](cells []Cell, key func(Cell) K) map[K][]Cell {
	groups := make(map[K][]Cell)
	for _, cell := range cells {
		groups[key(cell)] = append(groups[key(cell)], cell)
	}
	return groups
}

// seasonWeek is the key of one week of one season. It sorts by season and then by week.
type seasonWeek struct{ season, week int }

func (key seasonWeek) compare(other seasonWeek) int {
	return cmp.Or(cmp.Compare(key.season, other.season), cmp.Compare(key.week, other.week))
}

// pendingBy sums the pending games by a key.
func pendingBy[K comparable](pending []Pending, key func(Pending) K) map[K]int {
	counts := make(map[K]int)
	for _, entry := range pending {
		counts[key(entry)] += entry.Games
	}
	return counts
}

// BySeason gives every season with a scored or a pending game, oldest first. Only the current
// season can be in progress, and only while it has pending games.
func BySeason(cells []Cell, pending []Pending, current int) []*model.SeasonAccuracy {
	groups := groupBy(cells, func(cell Cell) int { return cell.Season })
	counts := pendingBy(pending, func(entry Pending) int { return entry.Season })
	seasons := make([]int, 0, len(groups)+len(counts))
	for season := range groups {
		seasons = append(seasons, season)
	}
	for season := range counts {
		if _, found := groups[season]; !found {
			seasons = append(seasons, season)
		}
	}
	slices.Sort(seasons)

	result := make([]*model.SeasonAccuracy, 0, len(seasons))
	for _, season := range seasons {
		result = append(result, &model.SeasonAccuracy{
			Season:       season,
			PendingGames: counts[season],
			InProgress:   season == current && counts[season] > 0,
			Score:        Score(groups[season]),
		})
	}
	return result
}

// phases is the order of the phases.
var phases = []model.SeasonPhase{
	model.SeasonPhaseEarly, model.SeasonPhaseMid, model.SeasonPhaseLate, model.SeasonPhasePlayoff,
}

// ByPhase gives the four phases in order. A phase with no game has a score with no games.
func ByPhase(cells []Cell) []*model.PhaseAccuracy {
	groups := make(map[model.SeasonPhase][]Cell)
	for _, cell := range cells {
		phase := Phase(cell.Week, cell.Playoff)
		groups[phase] = append(groups[phase], cell)
	}
	result := make([]*model.PhaseAccuracy, 0, len(phases))
	for _, phase := range phases {
		result = append(result, &model.PhaseAccuracy{Phase: phase, Score: Score(groups[phase])})
	}
	return result
}

// binsPerUnit is the number of bins of five points in a probability of 1.
const binsPerUnit = 20

// Confidence gives the ten bins in order. A bin with no game has null rates.
func Confidence(cells []Cell) []*model.ConfidenceBin {
	sums := make([]totals, Bins)
	for _, cell := range cells {
		sums[min(max(cell.Bin, 0), Bins-1)].add(cell)
	}
	result := make([]*model.ConfidenceBin, 0, Bins)
	for bin, sum := range sums {
		result = append(result, &model.ConfidenceBin{
			LowerBound:      float64(binsPerUnit/2+bin) / binsPerUnit,
			UpperBound:      float64(binsPerUnit/2+bin+1) / binsPerUnit,
			Games:           sum.games,
			Ties:            sum.ties,
			MeanProbability: ratio(sum.favorite, sum.games),
			FavoriteWins:    sum.correct,
			ObservedRate:    ratio(float64(sum.correct)+float64(sum.ties)/2, sum.games),
			Accuracy:        ratio(float64(sum.correct), sum.decided),
		})
	}
	return result
}

// weeksOf gives each week of the cells, oldest first, with the pending games of the same week.
// A week with pending games only has no dates, so it is not listed.
func weeksOf(cells []Cell, pending []Pending) []*model.SeasonWeekAccuracy {
	groups := make(map[seasonWeek]totals)
	for _, cell := range cells {
		key := seasonWeek{cell.Season, cell.Week}
		sum := groups[key]
		sum.add(cell)
		groups[key] = sum
	}
	keys := make([]seasonWeek, 0, len(groups))
	for key := range groups {
		keys = append(keys, key)
	}
	slices.SortFunc(keys, seasonWeek.compare)
	counts := pendingBy(pending, func(entry Pending) seasonWeek { return seasonWeek{entry.Season, entry.Week} })

	result := make([]*model.SeasonWeekAccuracy, 0, len(keys))
	for _, key := range keys {
		sum := groups[key]
		result = append(result, &model.SeasonWeekAccuracy{
			Season:       key.season,
			Week:         key.week,
			FirstDate:    sum.firstDate,
			LastDate:     sum.lastDate,
			PendingGames: counts[key],
			Score:        sum.score(),
		})
	}
	return result
}

// SeasonWeeks lists the weeks of one season that have a scored game, oldest first, with the
// pending games of each week.
func SeasonWeeks(cells []Cell, pending []Pending, season int) []*model.SeasonWeekAccuracy {
	return weeksOf(InRange(cells, Range{season, season}), pending)
}

// WorstWeeks gives the weeks with the largest gap between the expected correct picks and the
// correct picks, worst first, at most limit of them. A week needs MinWorstWeekGames games. A week
// with a pending game is left out, because only a part of it is played. Weeks with the same gap
// keep the order of season and week, so the list is the same on each call.
func WorstWeeks(cells []Cell, pending []Pending, limit int) []*model.SeasonWeekAccuracy {
	weeks := slices.DeleteFunc(weeksOf(cells, pending), func(week *model.SeasonWeekAccuracy) bool {
		return week.Score.Games < MinWorstWeekGames || week.PendingGames > 0
	})
	slices.SortStableFunc(weeks, func(a, b *model.SeasonWeekAccuracy) int {
		return cmp.Compare(shortfall(a.Score), shortfall(b.Score))
	})
	return weeks[:min(limit, len(weeks))]
}

func shortfall(score *model.AccuracyScore) float64 {
	return float64(score.Correct) - score.ExpectedCorrect
}

// LastWeek gives the latest week whose scored games are at least as many as its pending games, so
// a week with only its first games played is not graded. It gives nil when no week qualifies.
func LastWeek(weeks []*model.SeasonWeekAccuracy) *model.SeasonWeekAccuracy {
	for index := len(weeks) - 1; index >= 0; index-- {
		if weeks[index].Score.Games >= weeks[index].PendingGames {
			return weeks[index]
		}
	}
	return nil
}
