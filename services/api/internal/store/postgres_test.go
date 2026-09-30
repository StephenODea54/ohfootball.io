package store

import (
	"database/sql"
	"reflect"
	"testing"
	"time"

	"github.com/StephenODea54/services/api/graph"
	"github.com/StephenODea54/services/api/graph/model"
	"github.com/jackc/pgx/v5/pgtype"
)

// The resolvers reach the warehouse through this interface. A method that changes shape has to
// change in both places, and this fails the build when only one of them changes.
var _ graph.FootballStore = (*Postgres)(nil)

func TestBuildPredictionFollowsTheSignOfTheMargin(t *testing.T) {
	win := buildPrediction(0.61, 4.2, 30.5, 26.3, "2026-09-29")
	if win.PredictedResult != model.GameResultWin || win.PredictedMargin != 4.2 || win.WinProbability != 0.61 {
		t.Fatalf("prediction = %+v, want a win by 4.2 at 0.61", win)
	}
	if win.TeamRating != 30.5 || win.OpponentRating != 26.3 || win.AsOf != "2026-09-29" {
		t.Fatalf("prediction = %+v, want the ratings and the date it was given", win)
	}
	loss := buildPrediction(0.39, -4.2, 26.3, 30.5, "2026-09-29")
	if loss.PredictedResult != model.GameResultLoss || loss.PredictedMargin != -4.2 {
		t.Fatalf("prediction = %+v, want a loss by 4.2", loss)
	}
	even := buildPrediction(0.5, 0, 12, 12, "2026-09-29")
	if even.PredictedResult != model.GameResultWin {
		t.Fatalf("prediction = %+v, want an even game to count as a pick of the team", even)
	}
}

func TestPredictionForNeedsEveryStoredValueAndAGameThatWasNotCanceled(t *testing.T) {
	value := func(number float64) pgtype.Float8 { return pgtype.Float8{Float64: number, Valid: true} }
	day := pgtype.Date{Time: time.Date(2026, 9, 29, 0, 0, 0, 0, time.UTC), Valid: true}

	prediction := predictionFor(model.GameResultUnknown, value(30), value(18), value(0.76), value(12), day)
	if prediction == nil || prediction.PredictedMargin != 12 || prediction.AsOf != "2026-09-29" {
		t.Fatalf("prediction = %+v, want a margin of 12 as of 2026-09-29", prediction)
	}
	if got := predictionFor(model.GameResultCanceled, value(30), value(18), value(0.76), value(12), day); got != nil {
		t.Fatalf("canceled game prediction = %+v, want nil", got)
	}
	if got := predictionFor(model.GameResultWin, value(30), value(18), value(0.76), pgtype.Float8{}, day); got != nil {
		t.Fatalf("prediction without a margin = %+v, want nil", got)
	}
	if got := predictionFor(model.GameResultWin, value(30), value(18), value(0.76), value(12), pgtype.Date{}); got != nil {
		t.Fatalf("prediction without a date = %+v, want nil", got)
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

func teamRow(rating, relativeRating, rank, asOf, previousRank any) fakeRow {
	return fakeRow{
		"team-key", 2026, "Massillon", "Tigers", "Massillon", int64(2), int64(7),
		"#ff6600", "#000000", int64(5), int64(1), int64(0),
		rating, relativeRating, rank, asOf, previousRank,
	}
}

func TestScanTeamReadsThePreviousRank(t *testing.T) {
	asOf := time.Date(2026, 9, 29, 0, 0, 0, 0, time.UTC)

	team, err := scanTeam(teamRow(54.5, 28.0, int64(12), asOf, int64(15)))
	if err != nil {
		t.Fatalf("scanTeam: %v", err)
	}
	if team.Rating == nil {
		t.Fatal("rating = nil, want a rating")
	}
	if team.Rating.Rank != 12 || team.Rating.PreviousRank == nil || *team.Rating.PreviousRank != 15 {
		t.Fatalf("rank = %d, previous rank = %v, want 12 and 15", team.Rating.Rank, team.Rating.PreviousRank)
	}
	if team.Rating.Rating != 54.5 || team.Rating.RelativeRating != 28.0 {
		t.Fatalf("rating = %+v, want 54.5 and a relative rating of 28", team.Rating)
	}
	if team.Rating.AsOf != "2026-09-29" || team.Rating.Season != 2026 {
		t.Fatalf("rating = %+v, want the season 2026 as of 2026-09-29", team.Rating)
	}
	if team.Elo != team.Rating {
		t.Fatalf("elo = %+v, want the same rating as the new field", team.Elo)
	}
	if *team.Division != 2 || *team.Region != 7 || team.Record.Wins != 5 {
		t.Fatalf("team = %+v, want division 2, region 7, and 5 wins", team)
	}
}

func TestScanTeamWithoutAnEarlierSnapshot(t *testing.T) {
	asOf := time.Date(2026, 8, 25, 0, 0, 0, 0, time.UTC)

	team, err := scanTeam(teamRow(-12.0, -38.5, int64(40), asOf, nil))
	if err != nil {
		t.Fatalf("scanTeam: %v", err)
	}
	if team.Rating == nil || team.Rating.PreviousRank != nil {
		t.Fatalf("rating = %+v, want a rating with no previous rank", team.Rating)
	}
}

func TestScanTeamWithoutARating(t *testing.T) {
	team, err := scanTeam(teamRow(nil, nil, nil, nil, nil))
	if err != nil {
		t.Fatalf("scanTeam: %v", err)
	}
	if team.Rating != nil || team.Elo != nil {
		t.Fatalf("rating = %+v, elo = %+v, want nil", team.Rating, team.Elo)
	}
}

func TestScanRatingReadsThePreviousRank(t *testing.T) {
	asOf := time.Date(2026, 9, 29, 0, 0, 0, 0, time.UTC)

	rating, err := scanRating(fakeRow{2026, 54.5, 28.0, int64(12), int64(15), asOf})
	if err != nil {
		t.Fatalf("scanRating: %v", err)
	}
	if rating.Rank != 12 || rating.PreviousRank == nil || *rating.PreviousRank != 15 {
		t.Fatalf("rank = %d, previous rank = %v, want 12 and 15", rating.Rank, rating.PreviousRank)
	}
	if rating.AsOf != "2026-09-29" || rating.Season != 2026 || rating.Rating != 54.5 || rating.RelativeRating != 28.0 {
		t.Fatalf("rating = %+v, want the season 2026 as of 2026-09-29", rating)
	}

	first, err := scanRating(fakeRow{2026, -12.0, -38.5, int64(40), nil, asOf})
	if err != nil {
		t.Fatalf("scanRating: %v", err)
	}
	if first.PreviousRank != nil {
		t.Fatalf("previous rank = %v, want nil", *first.PreviousRank)
	}
}
