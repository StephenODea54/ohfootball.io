package accuracy

import (
	"math"
	"testing"
)

func near(got *float64, want float64) bool {
	return got != nil && math.Abs(*got-want) < 1e-9
}

func TestScoreAddsTheCells(t *testing.T) {
	cells := []Cell{
		{
			Games: 10, Ties: 1, Decided: 9, Correct: 7, ExactMargins: 2, SumSquaredError: 1.5, SumLogLoss: 4,
			SumFavoriteProbability: 7.5, SumFavoriteProbabilityDecided: 6.8,
		},
		{
			Games: 10, Decided: 10, Correct: 9, ExactMargins: 1, SumSquaredError: 0.5, SumLogLoss: 2,
			SumFavoriteProbability: 8.2, SumFavoriteProbabilityDecided: 8.2,
		},
	}
	score := Score(cells)
	if score.Games != 20 || score.Ties != 1 || score.Decided != 19 || score.Correct != 16 ||
		score.ExactMargins != 3 {
		t.Fatalf("counts = %+v, want 20 games, 1 tie, 19 decided, 16 correct, 3 exact margins", score)
	}
	if !near(score.Accuracy, 16.0/19) || !near(score.BrierScore, 0.1) || !near(score.LogLoss, 0.3) {
		t.Fatalf("rates = %v %v %v, want 16/19, 0.1, 0.3", *score.Accuracy, *score.BrierScore, *score.LogLoss)
	}
	if math.Abs(score.ExpectedCorrect-15) > 1e-9 {
		t.Fatalf("expectedCorrect = %v, want the decided sum 15", score.ExpectedCorrect)
	}
}

func TestScoreWithNoGamesHasNoRates(t *testing.T) {
	score := Score(nil)
	if score.Games != 0 || score.Accuracy != nil || score.BrierScore != nil || score.LogLoss != nil {
		t.Fatalf("score = %+v, want no rates", score)
	}
}

func TestScoreOfTiesOnlyHasNoAccuracy(t *testing.T) {
	score := Score([]Cell{{Games: 2, Ties: 2, SumSquaredError: 0.5, SumLogLoss: 1.4}})
	if score.Accuracy != nil {
		t.Fatalf("score = %+v, want no accuracy", score)
	}
	if !near(score.BrierScore, 0.25) || !near(score.LogLoss, 0.7) {
		t.Fatalf("score = %+v, want a Brier score of 0.25 and a log loss of 0.7", score)
	}
}

func TestTotalsKeepTheFirstAndTheLastDate(t *testing.T) {
	var sum totals
	for _, cell := range []Cell{
		{Games: 1, FirstDate: "2026-09-25", LastDate: "2026-09-25"},
		{Games: 1, FirstDate: "2026-09-24", LastDate: "2026-09-24"},
		{Games: 1, FirstDate: "2026-09-26", LastDate: "2026-09-26"},
	} {
		sum.add(cell)
	}
	if sum.firstDate != "2026-09-24" || sum.lastDate != "2026-09-26" {
		t.Fatalf("dates = %s to %s, want 2026-09-24 to 2026-09-26", sum.firstDate, sum.lastDate)
	}
}
