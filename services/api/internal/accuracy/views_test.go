package accuracy

import (
	"testing"

	"github.com/StephenODea54/services/api/graph/model"
)

// cell gives a cell of one week with games games, correct of them right, and expected the sum of
// the favorite probabilities.
func cell(season, week int, games, correct int, expected float64) Cell {
	return Cell{
		Season: season, Week: week, Games: games, Decided: games, Correct: correct,
		SumFavoriteProbability: expected, SumFavoriteProbabilityDecided: expected,
		FirstDate: "2026-09-24", LastDate: "2026-09-26",
	}
}

func TestBySeasonMarksOnlyTheCurrentSeasonWithPendingGames(t *testing.T) {
	cells := []Cell{cell(2025, 1, 10, 8, 8), cell(2026, 1, 10, 7, 8), cell(2024, 3, 5, 4, 4)}
	pending := []Pending{{Season: 2026, Week: 2, Games: 3}, {Season: 2027, Week: 1, Games: 4}, {Season: 2025, Week: 16, Games: 1}}

	seasons := BySeason(cells, pending, 2026)
	if len(seasons) != 4 {
		t.Fatalf("seasons = %d, want 2024 to 2027", len(seasons))
	}
	for index, want := range []struct {
		season, pending, games int
		inProgress             bool
	}{{2024, 0, 5, false}, {2025, 1, 10, false}, {2026, 3, 10, true}, {2027, 4, 0, false}} {
		got := seasons[index]
		if got.Season != want.season || got.PendingGames != want.pending || got.Score.Games != want.games ||
			got.InProgress != want.inProgress {
			t.Errorf("season %d = %+v, want %+v", index, got, want)
		}
	}
	if seasons[3].Score.Accuracy != nil {
		t.Errorf("a season with pending games only has accuracy %v, want nil", *seasons[3].Score.Accuracy)
	}
}

func TestByPhaseGivesTheFourPhasesInOrder(t *testing.T) {
	empty := ByPhase(nil)
	want := []model.SeasonPhase{
		model.SeasonPhaseEarly, model.SeasonPhaseMid, model.SeasonPhaseLate, model.SeasonPhasePlayoff,
	}
	if len(empty) != len(want) {
		t.Fatalf("phases = %d, want 4", len(empty))
	}
	for index, phase := range want {
		if empty[index].Phase != phase || empty[index].Score.Games != 0 {
			t.Fatalf("phase %d = %+v, want an empty %s", index, empty[index], phase)
		}
	}

	playoff := cell(2025, 7, 4, 3, 3)
	playoff.Playoff = true
	phases := ByPhase([]Cell{cell(2025, 3, 10, 7, 7), cell(2025, 4, 5, 4, 4), cell(2025, 8, 6, 6, 5), playoff})
	for index, games := range []int{10, 5, 6, 4} {
		if phases[index].Score.Games != games {
			t.Errorf("phase %s has %d games, want %d", phases[index].Phase, phases[index].Score.Games, games)
		}
	}
}

func TestConfidenceGivesTenBins(t *testing.T) {
	empty := Confidence(nil)
	if len(empty) != Bins {
		t.Fatalf("bins = %d, want %d", len(empty), Bins)
	}
	if empty[0].LowerBound != 0.5 || empty[0].UpperBound != 0.55 || empty[9].LowerBound != 0.95 ||
		empty[9].UpperBound != 1 {
		t.Fatalf("bounds = %v to %v and %v to %v, want 0.5 to 0.55 and 0.95 to 1",
			empty[0].LowerBound, empty[0].UpperBound, empty[9].LowerBound, empty[9].UpperBound)
	}
	if empty[0].MeanProbability != nil || empty[0].ObservedRate != nil || empty[0].Accuracy != nil {
		t.Fatalf("empty bin = %+v, want null rates", empty[0])
	}

	bins := Confidence([]Cell{
		{Bin: 0, Games: 4, Ties: 1, Decided: 3, Correct: 2, SumFavoriteProbability: 2.1},
		{Bin: 9, Games: 10, Decided: 10, Correct: 10, SumFavoriteProbability: 9.8},
		{Bin: 12, Games: 1, Decided: 1, Correct: 1, SumFavoriteProbability: 1},
		{Bin: -1, Games: 2, Decided: 2, Correct: 1, SumFavoriteProbability: 1},
	})
	if bins[0].Games != 6 || bins[0].Ties != 1 || bins[0].FavoriteWins != 3 {
		t.Fatalf("bin 0 = %+v, want 6 games, 1 tie, and 3 wins of the favorite", bins[0])
	}
	if !near(bins[0].MeanProbability, 3.1/6) || !near(bins[0].ObservedRate, 3.5/6) || !near(bins[0].Accuracy, 3.0/5) {
		t.Fatalf("bin 0 = %v %v %v, want 3.1/6, 3.5/6, 3/5",
			*bins[0].MeanProbability, *bins[0].ObservedRate, *bins[0].Accuracy)
	}
	if bins[9].Games != 11 || !near(bins[9].Accuracy, 1) {
		t.Fatalf("bin 9 = %+v, want 11 games, all won by the favorite", bins[9])
	}
}

func TestSeasonWeeksAttachesThePendingGames(t *testing.T) {
	first := cell(2026, 1, 10, 8, 8)
	first.FirstDate, first.LastDate = "2026-08-20", "2026-08-21"
	late := cell(2026, 1, 2, 1, 1)
	late.FirstDate, late.LastDate = "2026-08-22", "2026-08-22"
	cells := []Cell{cell(2026, 2, 5, 4, 4), first, late, cell(2025, 1, 10, 9, 9)}
	pending := []Pending{{Season: 2026, Week: 2, Games: 7}, {Season: 2026, Week: 3, Games: 300}}

	weeks := SeasonWeeks(cells, pending, 2026)
	if len(weeks) != 2 {
		t.Fatalf("weeks = %+v, want weeks 1 and 2 of 2026 only", weeks)
	}
	if weeks[0].Week != 1 || weeks[0].Score.Games != 12 || weeks[0].FirstDate != "2026-08-20" ||
		weeks[0].LastDate != "2026-08-22" || weeks[0].PendingGames != 0 {
		t.Fatalf("week 1 = %+v, want 12 games from 2026-08-20 to 2026-08-22", weeks[0])
	}
	if weeks[1].Week != 2 || weeks[1].PendingGames != 7 || weeks[1].Season != 2026 {
		t.Fatalf("week 2 = %+v, want 7 pending games", weeks[1])
	}
}

func TestWorstWeeksRespectTheMinimumTheLimitAndTheOrder(t *testing.T) {
	cells := []Cell{
		cell(2015, 4, 347, 265, 285.7), // 20.7 short
		cell(2012, 7, 352, 273, 291.1), // 18.1 short
		cell(2005, 2, 99, 40, 90),      // too few games
		cell(2010, 3, 200, 180, 170),   // 10 over
		cell(2011, 5, 100, 90, 95),     // 5 short
		cell(2009, 5, 100, 90, 95),     // 5 short, an earlier season
	}

	worst := WorstWeeks(cells, nil, 10)
	if len(worst) != 5 {
		t.Fatalf("worst weeks = %d, want 5 with at least %d games", len(worst), MinWorstWeekGames)
	}
	order := [][2]int{{2015, 4}, {2012, 7}, {2009, 5}, {2011, 5}, {2010, 3}}
	for index, want := range order {
		if worst[index].Season != want[0] || worst[index].Week != want[1] {
			t.Fatalf("worst week %d = %d week %d, want %d week %d",
				index, worst[index].Season, worst[index].Week, want[0], want[1])
		}
	}
	pending := []Pending{{Season: 2015, Week: 4, Games: 1}}
	if half := WorstWeeks(cells, pending, 10); len(half) != 4 || half[0].Season != 2012 {
		t.Fatalf("worst weeks = %+v, want the week with a pending game left out", half)
	}
	if limited := WorstWeeks(cells, nil, 2); len(limited) != 2 || limited[1].Season != 2012 {
		t.Fatalf("worst weeks with a limit of 2 = %+v, want 2015 and 2012", limited)
	}
}

func TestLastWeekSkipsAWeekWithMorePendingThanScoredGames(t *testing.T) {
	week := func(number, games, pending int) *model.SeasonWeekAccuracy {
		return &model.SeasonWeekAccuracy{Week: number, PendingGames: pending, Score: &model.AccuracyScore{Games: games}}
	}
	if got := LastWeek(nil); got != nil {
		t.Fatalf("LastWeek of no weeks = %+v, want nil", got)
	}
	weeks := []*model.SeasonWeekAccuracy{week(5, 338, 0), week(6, 337, 0), week(7, 20, 330)}
	if got := LastWeek(weeks); got == nil || got.Week != 6 {
		t.Fatalf("LastWeek = %+v, want week 6", got)
	}
	weeks = append(weeks[:2], week(7, 180, 170))
	if got := LastWeek(weeks); got == nil || got.Week != 7 {
		t.Fatalf("LastWeek = %+v, want week 7 once most of it is played", got)
	}
	if got := LastWeek([]*model.SeasonWeekAccuracy{week(1, 1, 300)}); got != nil {
		t.Fatalf("LastWeek = %+v, want nil when no week is mostly played", got)
	}
}
