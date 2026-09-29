package store

import (
	"database/sql"
	"math"
	"reflect"
	"testing"
	"time"

	"github.com/StephenODea54/services/api/graph"
	"github.com/StephenODea54/services/api/graph/model"
)

// The resolvers reach the warehouse through this interface. A method that changes shape has to
// change in both places, and this fails the build when only one of them changes.
var _ graph.FootballStore = (*Postgres)(nil)

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

// fakeRow answers Scan with fixed column values, so a scan function can be tested without a
// database. A pgtype value reads its column through sql.Scanner. Any other target takes the value
// as it is.
type fakeRow []any

func (row fakeRow) Scan(dest ...any) error {
	for index, target := range dest {
		if scanner, ok := target.(sql.Scanner); ok {
			if err := scanner.Scan(row[index]); err != nil {
				return err
			}
			continue
		}
		reflect.ValueOf(target).Elem().Set(reflect.ValueOf(row[index]))
	}
	return nil
}

func teamRow(rating, rank, asOf, previousRank any) fakeRow {
	return fakeRow{
		"team-key", 2026, "Massillon", "Tigers", "Massillon", int64(2), int64(7),
		"#ff6600", "#000000", int64(5), int64(1), int64(0),
		rating, rank, asOf, previousRank,
	}
}

func TestScanTeamReadsThePreviousRank(t *testing.T) {
	asOf := time.Date(2026, 9, 29, 0, 0, 0, 0, time.UTC)

	team, err := scanTeam(teamRow(1734.5, int64(12), asOf, int64(15)))
	if err != nil {
		t.Fatalf("scanTeam: %v", err)
	}
	if team.Elo == nil {
		t.Fatal("elo = nil, want a rating")
	}
	if team.Elo.Rank != 12 || team.Elo.PreviousRank == nil || *team.Elo.PreviousRank != 15 {
		t.Fatalf("rank = %d, previous rank = %v, want 12 and 15", team.Elo.Rank, team.Elo.PreviousRank)
	}
	if team.Elo.AsOf != "2026-09-29" || team.Elo.Season != 2026 {
		t.Fatalf("elo = %+v, want the season 2026 as of 2026-09-29", team.Elo)
	}
	if *team.Division != 2 || *team.Region != 7 || team.Record.Wins != 5 {
		t.Fatalf("team = %+v, want division 2, region 7, and 5 wins", team)
	}
}

func TestScanTeamWithoutAnEarlierSnapshot(t *testing.T) {
	asOf := time.Date(2026, 8, 25, 0, 0, 0, 0, time.UTC)

	team, err := scanTeam(teamRow(1500.0, int64(40), asOf, nil))
	if err != nil {
		t.Fatalf("scanTeam: %v", err)
	}
	if team.Elo == nil || team.Elo.PreviousRank != nil {
		t.Fatalf("elo = %+v, want a rating with no previous rank", team.Elo)
	}
}

func TestScanTeamWithoutARating(t *testing.T) {
	team, err := scanTeam(teamRow(nil, nil, nil, nil))
	if err != nil {
		t.Fatalf("scanTeam: %v", err)
	}
	if team.Elo != nil {
		t.Fatalf("elo = %+v, want nil", team.Elo)
	}
}

func TestScanRatingReadsThePreviousRank(t *testing.T) {
	asOf := time.Date(2026, 9, 29, 0, 0, 0, 0, time.UTC)

	rating, err := scanRating(fakeRow{2026, 1734.5, int64(12), int64(15), asOf})
	if err != nil {
		t.Fatalf("scanRating: %v", err)
	}
	if rating.Rank != 12 || rating.PreviousRank == nil || *rating.PreviousRank != 15 {
		t.Fatalf("rank = %d, previous rank = %v, want 12 and 15", rating.Rank, rating.PreviousRank)
	}
	if rating.AsOf != "2026-09-29" || rating.Season != 2026 || rating.Rating != 1734.5 {
		t.Fatalf("rating = %+v, want the season 2026 as of 2026-09-29", rating)
	}

	first, err := scanRating(fakeRow{2026, 1500.0, int64(40), nil, asOf})
	if err != nil {
		t.Fatalf("scanRating: %v", err)
	}
	if first.PreviousRank != nil {
		t.Fatalf("previous rank = %v, want nil", *first.PreviousRank)
	}
}
