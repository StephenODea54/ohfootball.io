package store

import (
	"math"
	"testing"

	"github.com/StephenODea54/services/api/graph/model"
)

func TestWinProbability(t *testing.T) {
	config := PredictionConfig{HomeAdvantage: 30, RatingScale: 400}

	even := winProbability(1500, 1500, model.GameLocationNeutral, config)
	if even != 0.5 {
		t.Fatalf("even probability = %v, want 0.5", even)
	}
	home := winProbability(1500, 1500, model.GameLocationHome, config)
	away := winProbability(1500, 1500, model.GameLocationAway, config)
	if home <= 0.5 || away >= 0.5 {
		t.Fatalf("home = %v and away = %v, want home > 0.5 and away < 0.5", home, away)
	}
	if math.Abs(home-(1-away)) > 1e-12 {
		t.Fatalf("home and away probabilities are not symmetric: %v, %v", home, away)
	}
}
