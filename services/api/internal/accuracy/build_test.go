package accuracy

import (
	"testing"

	"github.com/StephenODea54/services/api/graph/model"
)

func TestReportDescribesTheCurrentSeason(t *testing.T) {
	cells := []Cell{cell(2025, 1, 10, 8, 8), cell(2026, 1, 344, 245, 250), cell(2026, 2, 334, 250, 260)}
	pending := []Pending{{Season: 2026, Week: 3, Games: 340}}

	report := Report(cells, pending, 2026)
	if report.Season != 2026 || len(report.Weeks) != 2 || report.Weeks[0].Score.Games != 344 {
		t.Fatalf("report = %+v, want the 2 weeks of 2026", report)
	}
	if report.LastWeek == nil || report.LastWeek.Week != 2 {
		t.Fatalf("last week = %+v, want week 2", report.LastWeek)
	}
	if report.LastWeekUpsets == nil || len(report.LastWeekUpsets) != 0 {
		t.Fatalf("upsets = %v, want an empty list", report.LastWeekUpsets)
	}

	empty := Report(nil, pending, 2026)
	if empty.LastWeek != nil || len(empty.Weeks) != 0 {
		t.Fatalf("report of a season with no result = %+v, want no weeks", empty)
	}
}

func TestAssembleCutsTheViewsToTheRange(t *testing.T) {
	playoff := cell(2025, 11, 100, 80, 85)
	playoff.Playoff = true
	cells := []Cell{cell(1990, 1, 300, 200, 210), cell(2025, 1, 300, 250, 240), playoff, cell(2026, 1, 300, 260, 250)}
	upsets := []*model.ScoredGame{{ID: "upset"}}
	report := Report(cells, nil, 2026)

	answer := Assemble(cells, nil, 2026, Range{From: 2000, To: 2026}, upsets, report)
	if answer.CurrentSeason != 2026 || answer.FromSeason != 2000 {
		t.Fatalf("answer = %+v, want 2000 to 2026 with the current season 2026", answer)
	}
	if answer.Overall.Games != 700 {
		t.Fatalf("overall games = %d, want 700 from 2000 on", answer.Overall.Games)
	}
	if len(answer.Seasons) != 3 || answer.Seasons[0].Season != 1990 {
		t.Fatalf("seasons = %+v, want every season from 1990", answer.Seasons)
	}
	if len(answer.Phases) != 4 || answer.Phases[3].Score.Games != 100 {
		t.Fatalf("phases = %+v, want the 100 playoff games in the last phase", answer.Phases)
	}
	if len(answer.Confidence) != Bins || answer.Upsets[0].ID != "upset" || answer.Current != report {
		t.Fatalf("answer = %+v, want the bins, the upsets, and the report it was given", answer)
	}
	if len(answer.WorstWeeks) != 3 || answer.WorstWeeks[0].Season != 2025 || answer.WorstWeeks[0].Week != 11 {
		t.Fatalf("worst weeks = %+v, want week 11 of 2025 first", answer.WorstWeeks)
	}
}

func TestAssembleWithNoScoredGameHasNoGames(t *testing.T) {
	answer := Assemble(nil, nil, 2027, Range{From: 2000, To: 2027}, nil, Report(nil, nil, 2027))
	if answer.Overall.Games != 0 || len(answer.WorstWeeks) != 0 {
		t.Fatalf("answer = %+v, want no games and no worst weeks", answer)
	}
}
