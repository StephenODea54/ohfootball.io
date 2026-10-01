package accuracy

import (
	"testing"

	"github.com/StephenODea54/services/api/graph/model"
)

func TestPhaseFollowsTheWeekAndThePlayoffs(t *testing.T) {
	cases := []struct {
		week    int
		playoff bool
		want    model.SeasonPhase
	}{
		{1, false, model.SeasonPhaseEarly},
		{3, false, model.SeasonPhaseEarly},
		{4, false, model.SeasonPhaseMid},
		{7, false, model.SeasonPhaseMid},
		{8, false, model.SeasonPhaseLate},
		{12, false, model.SeasonPhaseLate},
		{7, true, model.SeasonPhasePlayoff},
	}
	for _, testCase := range cases {
		if got := Phase(testCase.week, testCase.playoff); got != testCase.want {
			t.Errorf("Phase(%d, %t) = %s, want %s", testCase.week, testCase.playoff, got, testCase.want)
		}
	}
}

func TestInRangeCutsBothEnds(t *testing.T) {
	cells := []Cell{{Season: 1999}, {Season: 2000}, {Season: 2010}, {Season: 2011}}
	kept := InRange(cells, Range{From: 2000, To: 2010})
	if len(kept) != 2 || kept[0].Season != 2000 || kept[1].Season != 2010 {
		t.Fatalf("InRange = %+v, want the seasons 2000 and 2010", kept)
	}
}

func TestResolveRangeAppliesTheDefaults(t *testing.T) {
	r, err := ResolveRange(2026, nil, nil)
	if err != nil || r != (Range{From: FirstScoredSeason, To: 2026}) {
		t.Fatalf("ResolveRange = %+v, %v, want 2000 to 2026", r, err)
	}

	from, to := 1973, 2023
	r, err = ResolveRange(2026, &from, &to)
	if err != nil || r != (Range{From: 1973, To: 2023}) {
		t.Fatalf("ResolveRange = %+v, %v, want 1973 to 2023", r, err)
	}

	early := 1990
	r, err = ResolveRange(2026, nil, &early)
	if err != nil || r != (Range{From: 1990, To: 1990}) {
		t.Fatalf("ResolveRange = %+v, %v, want 1990 alone when toSeason is before 2000", r, err)
	}
}

func TestResolveRangeRefusesABackwardRange(t *testing.T) {
	from, to := 2025, 2024
	_, err := ResolveRange(2026, &from, &to)
	if err == nil || err.Error() != "fromSeason 2025 is after toSeason 2024" {
		t.Fatalf("error = %v, want the backward range to be refused", err)
	}
}
