package store

import (
	"context"
	"database/sql"
	"math"
	"path/filepath"
	"testing"

	"github.com/StephenODea54/services/api/graph"
	"github.com/StephenODea54/services/api/graph/model"
)

// Both stores answer the schema, so both have to satisfy the interface the resolvers read through.
var (
	_ graph.FootballStore = (*SQLite)(nil)
	_ graph.FootballStore = (*Postgres)(nil)
)

// The fixture holds four Ohio teams in 2025 and one team from another state in 2026. Avon also has
// a 2024 season, which gives the rating history something to follow. Dayton has no rating, which
// exercises the joins that must still return a team without one.
const fixture = `
INSERT INTO dim_teams
	(team_key, source_id, season, state_code, name, mascot, city, division, region,
	 primary_color_hex, secondary_color_hex)
VALUES
	('team-a-2025', 'src-a', 2025, 'OH', 'Avon',             'Eagles', 'Avon',   2,    5,    '#001f5b', '#c8102e'),
	('team-b-2025', 'src-b', 2025, 'OH', 'Berea',            'Titans', 'Berea',  3,    9,    '#0d3b66', NULL),
	('team-c-2025', 'src-c', 2025, 'OH', 'Cleveland Heights', NULL,     NULL,    NULL, NULL, NULL,      NULL),
	('team-d-2025', 'src-d', 2025, 'OH', 'Dayton',           'Flyers', 'Dayton', 4,    5,    NULL,      NULL),
	('team-a-2024', 'src-a', 2024, 'OH', 'Avon',             'Eagles', 'Avon',   2,    5,    '#001f5b', '#c8102e'),
	('team-x-2026', 'src-x', 2026, 'MI', 'Detroit Central',  'Trojans', 'Detroit', 1,  1,    NULL,      NULL);

INSERT INTO dim_dates (date_key, date_day) VALUES
	(20250829, '2025-08-29'),
	(20250905, '2025-09-05'),
	(20251010, '2025-10-10');

INSERT INTO fct_games
	(game_key, season, game_date_key, team_a_key, team_b_key, is_team_a_home, is_team_b_home,
	 team_a_result, team_b_result, team_a_score, team_b_score, is_playoff_game, notes)
VALUES
	('game-1', 2025, 20250829, 'team-a-2025', 'team-b-2025', 1, 0, 'W', 'L', 28,   14,   0, NULL),
	('game-2', 2025, 20250905, 'team-a-2025', 'team-c-2025', 0, 1, 'U', 'U', NULL, NULL, 0, 'season opener'),
	('game-3', 2025, 20251010, 'team-b-2025', 'team-c-2025', 0, 0, 'T', 'T', 21,   21,   1, NULL);

INSERT INTO fct_team_elo_ratings (team_key, season, elo_rating, as_of_date) VALUES
	('team-a-2025', 2025, 1600, '2025-09-01'),
	('team-b-2025', 2025, 1500, '2025-09-01'),
	('team-c-2025', 2025, 1400, '2025-09-01'),
	('team-a-2025', 2025, 1700, '2025-10-15'),
	('team-b-2025', 2025, 1450, '2025-10-15'),
	('team-c-2025', 2025, 1300, '2025-10-15'),
	('team-a-2024', 2024, 1550, '2024-10-15');

INSERT INTO fct_game_predictions
	(game_key, game_date, team_a_rating, team_b_rating, team_a_win_probability)
VALUES
	('game-1', '2025-08-29', 1580, 1490, 0.62);
`

func openFixture(t *testing.T) *SQLite {
	t.Helper()
	path := filepath.Join(t.TempDir(), "snapshot.db")

	writer, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("create snapshot: %v", err)
	}
	if _, err := writer.Exec(SQLiteSchema); err != nil {
		writer.Close()
		t.Fatalf("apply schema: %v", err)
	}
	if _, err := writer.Exec(fixture); err != nil {
		writer.Close()
		t.Fatalf("load fixture: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	store, err := OpenSQLite(path, PredictionConfig{HomeAdvantage: 30, RatingScale: 400})
	if err != nil {
		t.Fatalf("open snapshot: %v", err)
	}
	t.Cleanup(func() { store.Close() })
	return store
}

func names(teams []*model.Team) []string {
	list := make([]string, 0, len(teams))
	for _, team := range teams {
		list = append(list, team.Name)
	}
	return list
}

func equal(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func TestSQLiteOpenRejectsAnUnusableRatingScale(t *testing.T) {
	if _, err := OpenSQLite("ignored.db", PredictionConfig{RatingScale: 0}); err == nil {
		t.Fatal("a rating scale of zero was accepted")
	}
}

func TestSQLiteOpenReportsAMissingFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "absent.db")
	if _, err := OpenSQLite(path, PredictionConfig{HomeAdvantage: 30, RatingScale: 400}); err == nil {
		t.Fatal("a missing snapshot was accepted")
	}
}

func TestSQLitePing(t *testing.T) {
	if err := openFixture(t).Ping(context.Background()); err != nil {
		t.Fatalf("Ping = %v, want nil", err)
	}
}

// The team from another state has the highest season in the file. The current season has to ignore
// it.
func TestSQLiteCurrentSeason(t *testing.T) {
	season, err := openFixture(t).CurrentSeason(context.Background())
	if err != nil {
		t.Fatalf("CurrentSeason = %v", err)
	}
	if season != 2025 {
		t.Fatalf("CurrentSeason = %d, want 2025", season)
	}
}

func TestSQLiteListTeamsSortsByRatingAndPutsAnUnratedTeamLast(t *testing.T) {
	teams, err := openFixture(t).ListTeams(context.Background(), nil, nil, nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("ListTeams = %v", err)
	}
	want := []string{"Avon", "Berea", "Cleveland Heights", "Dayton"}
	if got := names(teams); !equal(got, want) {
		t.Fatalf("ListTeams = %v, want %v", got, want)
	}
	if teams[0].Elo == nil || teams[0].Elo.Rating != 1700 || teams[0].Elo.Rank != 1 {
		t.Fatalf("the top team carries %+v, want rating 1700 at rank 1", teams[0].Elo)
	}
	if teams[0].Elo.AsOf != "2025-10-15" {
		t.Fatalf("the top rating is as of %q, want the latest snapshot %q", teams[0].Elo.AsOf, "2025-10-15")
	}
	if teams[3].Elo != nil {
		t.Fatalf("the unrated team carries a rating: %+v", teams[3].Elo)
	}
}

func TestSQLiteListTeamsCountsRecords(t *testing.T) {
	teams, err := openFixture(t).ListTeams(context.Background(), nil, nil, nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("ListTeams = %v", err)
	}
	records := map[string]model.Record{}
	for _, team := range teams {
		records[team.Name] = *team.Record
	}
	cases := map[string]model.Record{
		"Avon":              {Wins: 1, Losses: 0, Ties: 0},
		"Berea":             {Wins: 0, Losses: 1, Ties: 1},
		"Cleveland Heights": {Wins: 0, Losses: 0, Ties: 1},
		"Dayton":            {Wins: 0, Losses: 0, Ties: 0},
	}
	for name, want := range cases {
		if got := records[name]; got != want {
			t.Fatalf("%s record = %+v, want %+v", name, got, want)
		}
	}
}

func TestSQLiteListTeamsSortsByName(t *testing.T) {
	sort := model.TeamSortName
	teams, err := openFixture(t).ListTeams(context.Background(), nil, nil, nil, nil, &sort, nil)
	if err != nil {
		t.Fatalf("ListTeams = %v", err)
	}
	want := []string{"Avon", "Berea", "Cleveland Heights", "Dayton"}
	if got := names(teams); !equal(got, want) {
		t.Fatalf("ListTeams by name = %v, want %v", got, want)
	}
}

// SQLite compares with LIKE without regard to case for ASCII. The Postgres store uses ILIKE to get
// the same result, so a lower case search has to match a capitalised name.
func TestSQLiteListTeamsSearchIgnoresCase(t *testing.T) {
	store := openFixture(t)
	for _, search := range []string{"ber", "BEREA", "Titans", "berea"} {
		teams, err := store.ListTeams(context.Background(), nil, &search, nil, nil, nil, nil)
		if err != nil {
			t.Fatalf("ListTeams(%q) = %v", search, err)
		}
		if got := names(teams); !equal(got, []string{"Berea"}) {
			t.Fatalf("ListTeams(%q) = %v, want [Berea]", search, got)
		}
	}
}

func TestSQLiteListTeamsFilters(t *testing.T) {
	store := openFixture(t)
	region := 9
	division := 2

	teams, err := store.ListTeams(context.Background(), nil, nil, &region, nil, nil, nil)
	if err != nil {
		t.Fatalf("ListTeams by region = %v", err)
	}
	if got := names(teams); !equal(got, []string{"Berea"}) {
		t.Fatalf("ListTeams by region = %v, want [Berea]", got)
	}

	teams, err = store.ListTeams(context.Background(), nil, nil, nil, &division, nil, nil)
	if err != nil {
		t.Fatalf("ListTeams by division = %v", err)
	}
	if got := names(teams); !equal(got, []string{"Avon"}) {
		t.Fatalf("ListTeams by division = %v, want [Avon]", got)
	}
}

func TestSQLiteListTeamsClampsTheLimit(t *testing.T) {
	store := openFixture(t)
	cases := []struct {
		limit int
		want  int
	}{
		{limit: 1, want: 1},
		{limit: 0, want: 1},
		{limit: -5, want: 1},
		{limit: maxLimit * 10, want: 4},
	}
	for _, testCase := range cases {
		limit := testCase.limit
		teams, err := store.ListTeams(context.Background(), nil, nil, nil, nil, nil, &limit)
		if err != nil {
			t.Fatalf("ListTeams(limit %d) = %v", limit, err)
		}
		if len(teams) != testCase.want {
			t.Fatalf("ListTeams(limit %d) returned %d teams, want %d", limit, len(teams), testCase.want)
		}
	}
}

func TestSQLiteListTeamsReadsASeason(t *testing.T) {
	season := 2024
	teams, err := openFixture(t).ListTeams(context.Background(), &season, nil, nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("ListTeams = %v", err)
	}
	if got := names(teams); !equal(got, []string{"Avon"}) {
		t.Fatalf("ListTeams for 2024 = %v, want [Avon]", got)
	}
}

func TestSQLiteTeamIsMissing(t *testing.T) {
	team, err := openFixture(t).Team(context.Background(), "team-nowhere", nil)
	if err != nil {
		t.Fatalf("Team = %v, want no error", err)
	}
	if team != nil {
		t.Fatalf("Team = %+v, want nil", team)
	}
}

func TestSQLiteTeamCarriesItsFacts(t *testing.T) {
	team, err := openFixture(t).Team(context.Background(), "team-a-2025", nil)
	if err != nil {
		t.Fatalf("Team = %v", err)
	}
	if team == nil {
		t.Fatal("Team = nil, want Avon")
	}
	if team.Name != "Avon" || team.Season != 2025 {
		t.Fatalf("Team = %s in %d, want Avon in 2025", team.Name, team.Season)
	}
	if team.Mascot == nil || *team.Mascot != "Eagles" {
		t.Fatalf("mascot = %v, want Eagles", team.Mascot)
	}
	if team.PrimaryColor == nil || *team.PrimaryColor != "#001f5b" {
		t.Fatalf("primary color = %v, want #001f5b", team.PrimaryColor)
	}
	if team.Division == nil || *team.Division != 2 || team.Region == nil || *team.Region != 5 {
		t.Fatalf("division and region = %v, %v, want 2 and 5", team.Division, team.Region)
	}
}

// A key belongs to one season. Asking for another season follows the same program through its
// source id.
func TestSQLiteTeamFollowsTheProgramIntoAnotherSeason(t *testing.T) {
	season := 2024
	team, err := openFixture(t).Team(context.Background(), "team-a-2025", &season)
	if err != nil {
		t.Fatalf("Team = %v", err)
	}
	if team == nil {
		t.Fatal("Team = nil, want Avon in 2024")
	}
	if team.ID != "team-a-2024" || team.Season != 2024 {
		t.Fatalf("Team = %s in %d, want team-a-2024 in 2024", team.ID, team.Season)
	}
}

func TestSQLiteTeamCarriesEveryRatingItHasHeld(t *testing.T) {
	team, err := openFixture(t).Team(context.Background(), "team-a-2025", nil)
	if err != nil {
		t.Fatalf("Team = %v", err)
	}
	if len(team.EloHistory) != 3 {
		t.Fatalf("history holds %d points, want 3", len(team.EloHistory))
	}
	wantSeasons := []int{2024, 2025, 2025}
	wantDates := []string{"2024-10-15", "2025-09-01", "2025-10-15"}
	wantRatings := []float64{1550, 1600, 1700}
	for index, point := range team.EloHistory {
		if point.Season != wantSeasons[index] || point.AsOf != wantDates[index] || point.Rating != wantRatings[index] {
			t.Fatalf(
				"history point %d = season %d rating %v as of %s, want season %d rating %v as of %s",
				index, point.Season, point.Rating, point.AsOf,
				wantSeasons[index], wantRatings[index], wantDates[index],
			)
		}
		if point.Rank != 1 {
			t.Fatalf("history point %d rank = %d, want 1", index, point.Rank)
		}
	}
}

func TestSQLiteTeamScheduleKeepsThePredictionMadeBeforeAPlayedGame(t *testing.T) {
	team, err := openFixture(t).Team(context.Background(), "team-a-2025", nil)
	if err != nil {
		t.Fatalf("Team = %v", err)
	}
	if len(team.Schedule) != 2 {
		t.Fatalf("schedule holds %d games, want 2", len(team.Schedule))
	}

	played := team.Schedule[0]
	if played.ID != "game-1" || played.Week != 1 || played.Date != "2025-08-29" {
		t.Fatalf("first game = %s in week %d on %s, want game-1 in week 1 on 2025-08-29", played.ID, played.Week, played.Date)
	}
	if played.Location != model.GameLocationHome || played.Result != model.GameResultWin {
		t.Fatalf("first game = %s %s, want HOME WIN", played.Location, played.Result)
	}
	if played.OpponentName != "Berea" {
		t.Fatalf("first opponent = %s, want Berea", played.OpponentName)
	}
	if played.TeamScore == nil || *played.TeamScore != 28 || played.OpponentScore == nil || *played.OpponentScore != 14 {
		t.Fatalf("first game score = %v to %v, want 28 to 14", played.TeamScore, played.OpponentScore)
	}
	if played.Prediction == nil {
		t.Fatal("a played game carries no prediction")
	}
	// The stored rating pair is used, not the rating the team holds now.
	if played.Prediction.WinProbability != 0.62 || played.Prediction.TeamRating != 1580 {
		t.Fatalf("first prediction = %+v, want probability 0.62 from rating 1580", played.Prediction)
	}
	if played.Prediction.AsOf != "2025-08-29" {
		t.Fatalf("first prediction as of %s, want 2025-08-29", played.Prediction.AsOf)
	}
}

func TestSQLiteTeamScheduleEstimatesAnUnplayedGame(t *testing.T) {
	team, err := openFixture(t).Team(context.Background(), "team-a-2025", nil)
	if err != nil {
		t.Fatalf("Team = %v", err)
	}
	unplayed := team.Schedule[1]
	if unplayed.ID != "game-2" || unplayed.Result != model.GameResultUnknown {
		t.Fatalf("second game = %s with result %s, want game-2 UNKNOWN", unplayed.ID, unplayed.Result)
	}
	// Avon is away, so the home advantage lands on Cleveland Heights.
	if unplayed.Location != model.GameLocationAway {
		t.Fatalf("second game location = %s, want AWAY", unplayed.Location)
	}
	if unplayed.Notes == nil || *unplayed.Notes != "season opener" {
		t.Fatalf("second game notes = %v, want \"season opener\"", unplayed.Notes)
	}
	if unplayed.TeamScore != nil || unplayed.OpponentScore != nil {
		t.Fatalf("an unplayed game carries a score: %v to %v", unplayed.TeamScore, unplayed.OpponentScore)
	}
	if unplayed.Prediction == nil {
		t.Fatal("an unplayed game carries no prediction")
	}
	want := winProbability(1700, 1300, model.GameLocationAway, PredictionConfig{HomeAdvantage: 30, RatingScale: 400})
	if math.Abs(unplayed.Prediction.WinProbability-want) > 1e-9 {
		t.Fatalf("second prediction probability = %v, want %v", unplayed.Prediction.WinProbability, want)
	}
	if unplayed.Prediction.AsOf != "2025-10-15" {
		t.Fatalf("second prediction as of %s, want the latest rating date 2025-10-15", unplayed.Prediction.AsOf)
	}
	if unplayed.Prediction.PredictedResult != model.GameResultWin {
		t.Fatalf("second prediction result = %s, want WIN", unplayed.Prediction.PredictedResult)
	}
}

func TestSQLiteTeamScheduleReadsANeutralPlayoffGame(t *testing.T) {
	team, err := openFixture(t).Team(context.Background(), "team-b-2025", nil)
	if err != nil {
		t.Fatalf("Team = %v", err)
	}
	if len(team.Schedule) != 2 {
		t.Fatalf("schedule holds %d games, want 2", len(team.Schedule))
	}
	playoff := team.Schedule[1]
	if playoff.ID != "game-3" || !playoff.Playoff {
		t.Fatalf("second game = %s with playoff %v, want game-3 marked as a playoff game", playoff.ID, playoff.Playoff)
	}
	if playoff.Location != model.GameLocationNeutral || playoff.Result != model.GameResultTie {
		t.Fatalf("second game = %s %s, want NEUTRAL TIE", playoff.Location, playoff.Result)
	}
}
