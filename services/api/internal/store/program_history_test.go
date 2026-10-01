package store

import (
	"strings"
	"testing"
	"time"

	"github.com/StephenODea54/services/api/graph/model"
)

func programSeasonRow(rating, relativeRating, rank, asOf any) fakeRow {
	return fakeRow{
		2002, int64(11), int64(3), int64(0), int64(3), int64(1), int64(0),
		rating, relativeRating, rank, asOf,
	}
}

func TestScanProgramSeasonReadsARatedSeason(t *testing.T) {
	asOf := time.Date(2002, 12, 31, 0, 0, 0, 0, time.UTC)

	season, err := scanProgramSeason(programSeasonRow(61.2, 50.5, int64(1), asOf))
	if err != nil {
		t.Fatalf("scanProgramSeason: %v", err)
	}
	if season.Season != 2002 {
		t.Fatalf("season = %d, want 2002", season.Season)
	}
	if *season.Record != (model.Record{Wins: 11, Losses: 3}) {
		t.Fatalf("record = %+v, want 11-3", season.Record)
	}
	if *season.PlayoffRecord != (model.Record{Wins: 3, Losses: 1}) {
		t.Fatalf("playoff record = %+v, want 3-1", season.PlayoffRecord)
	}
	rating := season.Rating
	if rating == nil {
		t.Fatal("rating = nil, want a rating")
	}
	if rating.Season != 2002 || rating.Rank != 1 || rating.Rating != 61.2 || rating.RelativeRating != 50.5 {
		t.Fatalf("rating = %+v, want rank 1 and a relative rating of 50.5 in 2002", rating)
	}
	if rating.AsOf != "2002-12-31" || rating.PreviousRank != nil {
		t.Fatalf("rating = %+v, want 2002-12-31 and no previous rank", rating)
	}
}

func TestScanProgramSeasonWithoutASnapshot(t *testing.T) {
	season, err := scanProgramSeason(programSeasonRow(nil, nil, nil, nil))
	if err != nil {
		t.Fatalf("scanProgramSeason: %v", err)
	}
	if season.Rating != nil {
		t.Fatalf("rating = %+v, want nil", season.Rating)
	}
	if season.Record.Wins != 11 || season.PlayoffRecord.Losses != 1 {
		t.Fatalf("records = %+v and %+v, want them read", season.Record, season.PlayoffRecord)
	}
}

func TestScanProgramSeasonWithNoGames(t *testing.T) {
	season, err := scanProgramSeason(fakeRow{
		2020, int64(0), int64(0), int64(0), int64(0), int64(0), int64(0),
		nil, nil, nil, nil,
	})
	if err != nil {
		t.Fatalf("scanProgramSeason: %v", err)
	}
	if *season.Record != (model.Record{}) || *season.PlayoffRecord != (model.Record{}) {
		t.Fatalf("records = %+v and %+v, want 0-0", season.Record, season.PlayoffRecord)
	}
}

func TestScanProgramSeasonReportsAScanError(t *testing.T) {
	if _, err := scanProgramSeason(fakeRow{2002}); err == nil {
		t.Fatal("scanProgramSeason of a short row = nil error, want an error")
	}
}

// Each value that scanProgramSeason reads must have a column in the query.
func TestProgramHistoryColumnsMatchTheValuesThatTheScanReads(t *testing.T) {
	selectList := programHistorySQL[strings.LastIndex(programHistorySQL, "SELECT"):strings.LastIndex(programHistorySQL, "FROM program")]
	columns := strings.Split(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(selectList), "SELECT")), "\n")
	if row := programSeasonRow(nil, nil, nil, nil); len(columns) != len(row) {
		t.Fatalf("the query selects %d columns, scanProgramSeason reads %d values", len(columns), len(row))
	}
}

// A source id can have rows in more than one state. The history keeps only the Ohio seasons, so
// the program CTE must filter on the state.
func TestProgramHistoryKeepsOnlyTheOhioSeasons(t *testing.T) {
	start := strings.Index(programHistorySQL, "WITH program AS (")
	end := strings.Index(programHistorySQL, "season_end AS (")
	if start < 0 || end < start {
		t.Fatal("programHistorySQL has no program CTE before season_end")
	}
	if program := programHistorySQL[start:end]; !strings.Contains(program, "AND state_code = 'OH'") {
		t.Fatalf("the program CTE does not keep only Ohio rows:\n%s", program)
	}
}
