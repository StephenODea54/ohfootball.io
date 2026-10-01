package accuracy

import "github.com/StephenODea54/services/api/graph/model"

// totals holds the sums of a set of cells.
type totals struct {
	games, ties, decided, correct, exactMargins      int
	squaredError, logLoss, favorite, favoriteDecided float64
	firstDate, lastDate                              string
}

func (sum *totals) add(cell Cell) {
	if sum.games == 0 || cell.FirstDate < sum.firstDate {
		sum.firstDate = cell.FirstDate
	}
	if cell.LastDate > sum.lastDate {
		sum.lastDate = cell.LastDate
	}
	sum.games += cell.Games
	sum.ties += cell.Ties
	sum.decided += cell.Decided
	sum.correct += cell.Correct
	sum.exactMargins += cell.ExactMargins
	sum.squaredError += cell.SumSquaredError
	sum.logLoss += cell.SumLogLoss
	sum.favorite += cell.SumFavoriteProbability
	sum.favoriteDecided += cell.SumFavoriteProbabilityDecided
}

func sum(cells []Cell) totals {
	var result totals
	for _, cell := range cells {
		result.add(cell)
	}
	return result
}

// ratio divides value by count, or gives nil when count is 0.
func ratio(value float64, count int) *float64 {
	if count == 0 {
		return nil
	}
	result := value / float64(count)
	return &result
}

func (sum totals) score() *model.AccuracyScore {
	return &model.AccuracyScore{
		Games:           sum.games,
		Ties:            sum.ties,
		Decided:         sum.decided,
		Correct:         sum.correct,
		ExactMargins:    sum.exactMargins,
		Accuracy:        ratio(float64(sum.correct), sum.decided),
		ExpectedCorrect: sum.favoriteDecided,
		BrierScore:      ratio(sum.squaredError, sum.games),
		LogLoss:         ratio(sum.logLoss, sum.games),
	}
}

// Score gives the scores of the games of the cells.
func Score(cells []Cell) *model.AccuracyScore {
	return sum(cells).score()
}
