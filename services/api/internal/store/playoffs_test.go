package store

import (
	"math"
	"testing"
	"time"

	"github.com/StephenODea54/services/api/graph/model"
)

func chance(value float64) *float64 { return &value }

func outlookFakeRow(teamID string, region int, games []string, odds ...*float64) fakeRow {
	if odds == nil {
		odds = []*float64{}
	}
	return fakeRow{
		teamID, "source-" + teamID, "Team " + teamID, "#111111", nil, int64(3), 12.5,
		region, 4, 2, 1,
		24.5, 70.0, 98, 11.2,
		0.75, 0.25, 0.05, 0.02, 6.4,
		games, odds, odds, odds, odds,
	}
}

func TestScanOutlookReadsEveryColumn(t *testing.T) {
	row, err := scanOutlook(outlookFakeRow("a", 9, []string{"g1", "g2"}))
	if err != nil {
		t.Fatalf("scanOutlook: %v", err)
	}
	outlook := row.outlook
	if row.region != 9 || row.division != 3 || len(row.gameKeys) != 2 {
		t.Fatalf("row = %+v, want region 9, division 3 and two games", row)
	}
	if outlook.Record.Ties != 1 || outlook.Divisor != 98 || outlook.RegionWinProbability != 0.02 ||
		outlook.ExpectedSeed != 6.4 || outlook.Rating == nil || *outlook.Rating != 12.5 {
		t.Fatalf("outlook = %+v", outlook)
	}
	if outlook.PrimaryColor == nil || outlook.SecondaryColor != nil {
		t.Fatalf("colors = %v and %v", outlook.PrimaryColor, outlook.SecondaryColor)
	}
}

func TestScanRecordAndGame(t *testing.T) {
	record, err := scanRecord(fakeRow{"a", 8, 2, 0.4, 4000, 18.0, 20.0, 22.0, 1.0, 0.9, 0.2})
	if err != nil || record.teamID != "a" || record.odds.Record.Wins != 8 || record.odds.Runs != 4000 {
		t.Fatalf("record = %+v, %v", record, err)
	}
	day := time.Date(2026, 10, 2, 0, 0, 0, 0, time.UTC)
	game, err := scanPlayoffGame(fakeRow{"g1", day, "a", "b", "A", "B", true, false, 0.7})
	if err != nil || game.date != "2026-10-02" || game.teamAWinProbability == nil {
		t.Fatalf("game = %+v, %v", game, err)
	}
	unpredicted, err := scanPlayoffGame(fakeRow{"g1", day, "a", "b", "A", "B", true, false, nil})
	if err != nil || unpredicted.teamAWinProbability != nil {
		t.Fatalf("unpredicted = %+v, %v", unpredicted, err)
	}
}

func TestAssemblePlayoffsGroupsByRegion(t *testing.T) {
	first, _ := scanOutlook(outlookFakeRow("a", 1, []string{"g1", "g2"}, chance(0.9), nil))
	second, _ := scanOutlook(outlookFakeRow("b", 1, []string{"g1"}))
	third, _ := scanOutlook(outlookFakeRow("c", 2, []string{"gone"}))
	probability := 0.8
	games := []gameRow{{
		id: "g1", date: "2026-10-02", teamA: "a", teamB: "b", nameA: "Team a", nameB: "Team b",
		isTeamAHome: true, teamAWinProbability: &probability,
	}, {
		id: "g2", date: "2026-10-09", teamA: "x", teamB: "a", nameA: "Other", nameB: "Team a",
		isTeamAHome: true,
	}}
	records := []recordRow{
		{teamID: "a", odds: &model.PlayoffRecordOdds{Record: &model.Record{Wins: 6, Losses: 4}, Probability: 1}},
		{teamID: "missing", odds: &model.PlayoffRecordOdds{Record: &model.Record{}}},
	}

	regions := assemblePlayoffs([]outlookRow{first, second, third}, records, games)

	if len(regions) != 2 || len(regions[0].Teams) != 2 || regions[0].Division != 3 {
		t.Fatalf("regions = %+v", regions)
	}
	a := regions[0].Teams[0]
	if len(a.Records) != 1 || a.Records[0].Record.Ties != 1 {
		t.Fatalf("records of team a = %+v", a.Records)
	}
	home, away := a.RemainingGames[0], a.RemainingGames[1]
	if home.Location != model.GameLocationHome || home.OpponentName != "Team b" || *home.WinProbability != 0.8 {
		t.Fatalf("home game = %+v", home)
	}
	if away.Location != model.GameLocationAway || away.WinProbability != nil || away.OpponentID != "x" {
		t.Fatalf("away game = %+v", away)
	}
	// The odds of each game come from the stored lists, in the order of the games.
	if *home.QualifyIfWin != 0.9 || *home.HomeIfLoss != 0.9 || away.QualifyIfWin != nil {
		t.Fatalf("home game = %+v, away game = %+v", home, away)
	}
	b := regions[0].Teams[1]
	if got := b.RemainingGames[0]; got.Location != model.GameLocationAway || math.Abs(*got.WinProbability-0.2) > 1e-12 {
		t.Fatalf("game of team b = %+v", got)
	}
	if b.RemainingGames[0].QualifyIfWin != nil {
		t.Fatal("a team without stored odds got odds for a game")
	}
	gone := regions[1].Teams[0].RemainingGames[0]
	if gone.OpponentName != "Unknown opponent" || gone.Location != model.GameLocationNeutral {
		t.Fatalf("a game that is gone = %+v", gone)
	}
}
