package store

import (
	"database/sql"
	"fmt"
	"reflect"
	"strings"
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
	if len(dest) != len(row) {
		return fmt.Errorf("scan reads %d values, the row has %d", len(dest), len(row))
	}
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
		"team-key", 2026, "1624", "Massillon", "Tigers", "Massillon", "Stark", 40.79, -81.52, int64(2), int64(7),
		"#ff6600", "#000000", int64(5), int64(1), int64(0), int64(2),
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
	if team.SourceID != "1624" || *team.Division != 2 || *team.Region != 7 || team.Record.Wins != 5 {
		t.Fatalf("team = %+v, want source id 1624, division 2, region 7, and 5 wins", team)
	}
}

func TestScanTeamWithoutAPreviousRank(t *testing.T) {
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
	if team.Rating != nil {
		t.Fatalf("rating = %+v, want nil", team.Rating)
	}
}

// The teams query does not read the history of each team, so it must answer an empty list and not
// null.
func TestScanTeamLeavesTheHistoriesEmpty(t *testing.T) {
	team, err := scanTeam(teamRow(nil, nil, nil, nil, nil))
	if err != nil {
		t.Fatalf("scanTeam: %v", err)
	}
	if team.ProgramHistory == nil || len(team.ProgramHistory) != 0 {
		t.Fatalf("program history = %v, want an empty list", team.ProgramHistory)
	}
	if team.RatingHistory == nil || len(team.RatingHistory) != 0 {
		t.Fatalf("rating history = %v, want an empty list", team.RatingHistory)
	}
}

func TestScanTeamReadsTheOutOfStateGamesPlayed(t *testing.T) {
	team, err := scanTeam(teamRow(nil, nil, nil, nil, nil))
	if err != nil {
		t.Fatalf("scanTeam: %v", err)
	}
	if team.OutOfStateGamesPlayed != 2 {
		t.Fatalf("out-of-state games played = %d, want 2", team.OutOfStateGamesPlayed)
	}
}

func TestScanTeamReadsTheCoordinates(t *testing.T) {
	team, err := scanTeam(teamRow(nil, nil, nil, nil, nil))
	if err != nil {
		t.Fatalf("scanTeam: %v", err)
	}
	if team.Coordinates == nil || team.Coordinates.Latitude != 40.79 || team.Coordinates.Longitude != -81.52 {
		t.Fatalf("coordinates = %+v, want 40.79 and -81.52", team.Coordinates)
	}

	for _, missing := range []int{7, 8} {
		row := teamRow(nil, nil, nil, nil, nil)
		row[missing] = nil
		team, err = scanTeam(row)
		if err != nil {
			t.Fatalf("scanTeam: %v", err)
		}
		if team.Coordinates != nil {
			t.Fatalf("coordinates = %+v with value %d missing, want nil", team.Coordinates, missing)
		}
	}
}

func TestScanTeamReadsTheCounty(t *testing.T) {
	team, err := scanTeam(teamRow(nil, nil, nil, nil, nil))
	if err != nil {
		t.Fatalf("scanTeam: %v", err)
	}
	if team.County == nil || *team.County != "Stark" {
		t.Fatalf("county = %v, want Stark", team.County)
	}

	row := teamRow(nil, nil, nil, nil, nil)
	row[6] = nil
	team, err = scanTeam(row)
	if err != nil {
		t.Fatalf("scanTeam: %v", err)
	}
	if team.County != nil {
		t.Fatalf("county = %q, want nil", *team.County)
	}
}

// Each line of teamColumns must hold one column, and scanTeam reads one value for each column.
func TestTeamColumnsMatchTheValuesThatScanTeamReads(t *testing.T) {
	columns := strings.Split(strings.TrimSpace(teamColumns), "\n")
	if row := teamRow(nil, nil, nil, nil, nil); len(columns) != len(row) {
		t.Fatalf("teamColumns has %d columns, scanTeam reads %d values", len(columns), len(row))
	}
}

func TestBothTeamQueriesJoinTheOutOfStateGames(t *testing.T) {
	for name, query := range map[string]string{"list": listTeamsSQL, "team": teamSQL} {
		if !strings.Contains(query, "LEFT JOIN out_of_state_games USING (team_key)") {
			t.Errorf("the %s query does not join out_of_state_games", name)
		}
	}
}

// The count of games against other states follows the rating, which leaves out a game whose
// opponent has no current row in dim_teams.
func TestTheOutOfStateCountNeedsACurrentOpponent(t *testing.T) {
	start := strings.Index(teamFacts, "out_of_state_games AS (")
	end := strings.Index(teamFacts, "latest_snapshot AS (")
	if start < 0 || end < start {
		t.Fatal("teamFacts does not hold out_of_state_games before latest_snapshot")
	}
	count := teamFacts[start:end]
	for _, rule := range []string{
		"INNER JOIN ohfootball_marts.dim_teams AS opponent\n\t\t\tON opponent.team_key = game.opponent_key\n\t\t   AND opponent.is_current",
		"opponent.state_code IS DISTINCT FROM 'OH'",
	} {
		if !strings.Contains(count, rule) {
			t.Errorf("out_of_state_games does not hold %q", rule)
		}
	}
	if strings.Contains(count, "LEFT JOIN") {
		t.Error("out_of_state_games keeps a game without a current opponent")
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

// The previous rank comes from the ratings that the teams carried into the games of the week before
// a snapshot. A prediction of a game not yet played is dated the day of the run, so both queries
// must keep only the predictions dated the day of their game, in the seven days before the
// snapshot.
func TestThePreviousRankReadsTheGamesOfTheWeekBeforeTheSnapshot(t *testing.T) {
	for name, query := range map[string]string{"teamFacts": teamFacts, "ratingHistorySQL": ratingHistorySQL} {
		for _, rule := range []string{
			"prediction.as_of_date = prediction.game_date",
			"as_of_date - 7",
			"prediction.game_date <",
		} {
			if !strings.Contains(query, rule) {
				t.Errorf("%s does not hold %q", name, rule)
			}
		}
	}
}

func programGameRow(location, result string, playoff bool) fakeRow {
	day := time.Date(2025, 10, 17, 0, 0, 0, 0, time.UTC)
	return fakeRow{2025, day, "306", "Canton McKinley", location, result, int64(28), int64(21), playoff}
}

func TestScanProgramGameReadsAGame(t *testing.T) {
	game, err := scanProgramGame(programGameRow("AWAY", "W", true))
	if err != nil {
		t.Fatalf("scanProgramGame: %v", err)
	}
	want := model.ProgramGame{
		Season: 2025, Date: "2025-10-17", OpponentSourceID: "306", OpponentName: "Canton McKinley",
		Location: model.GameLocationAway, Result: model.GameResultWin, TeamScore: 28, OpponentScore: 21,
		Playoff: true,
	}
	if *game != want {
		t.Fatalf("game = %+v, want %+v", *game, want)
	}

	tie, err := scanProgramGame(programGameRow("NEUTRAL", "T", false))
	if err != nil {
		t.Fatalf("scanProgramGame: %v", err)
	}
	if tie.Result != model.GameResultTie || tie.Location != model.GameLocationNeutral || tie.Playoff {
		t.Fatalf("game = %+v, want a tie on a neutral field in the regular season", *tie)
	}
}

func TestScanProgramGameStopsOnAShortRow(t *testing.T) {
	if _, err := scanProgramGame(fakeRow{2025}); err == nil {
		t.Fatal("scanProgramGame read a row with one value, want an error")
	}
}

// This test guards the text of the query and not what it does. A change that keeps the clauses
// but breaks the query still passes, so check a change of the query against a warehouse too.
func TestProgramGamesSQLKeepsOnlyOhioGamesWithAResult(t *testing.T) {
	for _, clause := range []string{
		"WHERE is_current AND state_code = 'OH' AND source_id = $1",
		"opponent.state_code = 'OH'",
		"game.result IN ('W', 'L', 'T')",
		"game.team_score IS NOT NULL",
		"game.opponent_score IS NOT NULL",
		"INNER JOIN program_seasons ON program_seasons.team_key = game.team_a_key",
		"INNER JOIN program_seasons ON program_seasons.team_key = game.team_b_key",
		"ORDER BY date.date_day, game.game_key",
	} {
		if !strings.Contains(programGamesSQL, clause) {
			t.Errorf("programGamesSQL does not hold %q", clause)
		}
	}
}

// Each line of the last SELECT of programGamesSQL must hold one column, and scanProgramGame reads
// one value for each column.
func TestProgramGamesColumnsMatchTheValuesThatScanReads(t *testing.T) {
	selects := strings.Split(programGamesSQL, "SELECT")
	last := strings.Split(selects[len(selects)-1], "FROM program_games")[0]
	columns := strings.Split(strings.TrimSpace(last), "\n")
	if row := programGameRow("HOME", "W", false); len(columns) != len(row) {
		t.Fatalf("programGamesSQL selects %d columns, scanProgramGame reads %d values", len(columns), len(row))
	}
}
