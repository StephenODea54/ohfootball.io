package db

import (
	"context"
)

// iteratorForInsertGames implements pgx.CopyFromSource.
type iteratorForInsertGames struct {
	rows                 []InsertGamesParams
	skippedFirstNextCall bool
}

func (r *iteratorForInsertGames) Next() bool {
	if len(r.rows) == 0 {
		return false
	}
	if !r.skippedFirstNextCall {
		r.skippedFirstNextCall = true
		return true
	}
	r.rows = r.rows[1:]
	return len(r.rows) > 0
}

func (r iteratorForInsertGames) Values() ([]interface{}, error) {
	return []interface{}{
		r.rows[0].ScrapeRunID,
		r.rows[0].Season,
		r.rows[0].SourceTeamID,
		r.rows[0].GameDate,
		r.rows[0].HomeAway,
		r.rows[0].OpponentTeamID,
		r.rows[0].Result,
		r.rows[0].Score,
		r.rows[0].Notes,
		r.rows[0].Playoff,
	}, nil
}

func (r iteratorForInsertGames) Err() error {
	return nil
}

func (q *Queries) InsertGames(ctx context.Context, arg []InsertGamesParams) (int64, error) {
	return q.db.CopyFrom(ctx, []string{"ohfootball_raw", "games"}, []string{"scrape_run_id", "season", "source_team_id", "game_date", "home_away", "opponent_team_id", "result", "score", "notes", "playoff"}, &iteratorForInsertGames{rows: arg})
}

// iteratorForInsertOhhsfbdbGames implements pgx.CopyFromSource.
type iteratorForInsertOhhsfbdbGames struct {
	rows                 []InsertOhhsfbdbGamesParams
	skippedFirstNextCall bool
}

func (r *iteratorForInsertOhhsfbdbGames) Next() bool {
	if len(r.rows) == 0 {
		return false
	}
	if !r.skippedFirstNextCall {
		r.skippedFirstNextCall = true
		return true
	}
	r.rows = r.rows[1:]
	return len(r.rows) > 0
}

func (r iteratorForInsertOhhsfbdbGames) Values() ([]interface{}, error) {
	return []interface{}{
		r.rows[0].ScrapeRunID,
		r.rows[0].Sheet,
		r.rows[0].Season,
		r.rows[0].Week,
		r.rows[0].GameDate,
		r.rows[0].DayOfWeek,
		r.rows[0].HomeAway,
		r.rows[0].OpponentName,
		r.rows[0].OpponentSheet,
		r.rows[0].TeamScore,
		r.rows[0].OpponentScore,
		r.rows[0].Overtime,
		r.rows[0].Result,
		r.rows[0].OpponentConference,
		r.rows[0].OpponentDivision,
		r.rows[0].OpponentRegion,
		r.rows[0].PlayoffRound,
		r.rows[0].TeamSeed,
		r.rows[0].OpponentSeed,
		r.rows[0].Stadium,
		r.rows[0].Location,
	}, nil
}

func (r iteratorForInsertOhhsfbdbGames) Err() error {
	return nil
}

func (q *Queries) InsertOhhsfbdbGames(ctx context.Context, arg []InsertOhhsfbdbGamesParams) (int64, error) {
	return q.db.CopyFrom(ctx, []string{"ohfootball_raw", "ohhsfbdb_games"}, []string{"scrape_run_id", "sheet", "season", "week", "game_date", "day_of_week", "home_away", "opponent_name", "opponent_sheet", "team_score", "opponent_score", "overtime", "result", "opponent_conference", "opponent_division", "opponent_region", "playoff_round", "team_seed", "opponent_seed", "stadium", "location"}, &iteratorForInsertOhhsfbdbGames{rows: arg})
}

// iteratorForInsertOhhsfbdbIndexEntries implements pgx.CopyFromSource.
type iteratorForInsertOhhsfbdbIndexEntries struct {
	rows                 []InsertOhhsfbdbIndexEntriesParams
	skippedFirstNextCall bool
}

func (r *iteratorForInsertOhhsfbdbIndexEntries) Next() bool {
	if len(r.rows) == 0 {
		return false
	}
	if !r.skippedFirstNextCall {
		r.skippedFirstNextCall = true
		return true
	}
	r.rows = r.rows[1:]
	return len(r.rows) > 0
}

func (r iteratorForInsertOhhsfbdbIndexEntries) Values() ([]interface{}, error) {
	return []interface{}{
		r.rows[0].ScrapeRunID,
		r.rows[0].Position,
		r.rows[0].SchoolName,
		r.rows[0].Sheet,
	}, nil
}

func (r iteratorForInsertOhhsfbdbIndexEntries) Err() error {
	return nil
}

func (q *Queries) InsertOhhsfbdbIndexEntries(ctx context.Context, arg []InsertOhhsfbdbIndexEntriesParams) (int64, error) {
	return q.db.CopyFrom(ctx, []string{"ohfootball_raw", "ohhsfbdb_index"}, []string{"scrape_run_id", "position", "school_name", "sheet"}, &iteratorForInsertOhhsfbdbIndexEntries{rows: arg})
}

// iteratorForInsertOhhsfbdbSeasonSummaries implements pgx.CopyFromSource.
type iteratorForInsertOhhsfbdbSeasonSummaries struct {
	rows                 []InsertOhhsfbdbSeasonSummariesParams
	skippedFirstNextCall bool
}

func (r *iteratorForInsertOhhsfbdbSeasonSummaries) Next() bool {
	if len(r.rows) == 0 {
		return false
	}
	if !r.skippedFirstNextCall {
		r.skippedFirstNextCall = true
		return true
	}
	r.rows = r.rows[1:]
	return len(r.rows) > 0
}

func (r iteratorForInsertOhhsfbdbSeasonSummaries) Values() ([]interface{}, error) {
	return []interface{}{
		r.rows[0].ScrapeRunID,
		r.rows[0].Sheet,
		r.rows[0].Season,
		r.rows[0].Conference,
		r.rows[0].RegularWins,
		r.rows[0].RegularLosses,
		r.rows[0].RegularTies,
		r.rows[0].ConferenceWins,
		r.rows[0].ConferenceLosses,
		r.rows[0].ConferenceTies,
		r.rows[0].PlayoffWins,
		r.rows[0].PlayoffLosses,
		r.rows[0].Division,
		r.rows[0].Region,
		r.rows[0].Rank,
	}, nil
}

func (r iteratorForInsertOhhsfbdbSeasonSummaries) Err() error {
	return nil
}

func (q *Queries) InsertOhhsfbdbSeasonSummaries(ctx context.Context, arg []InsertOhhsfbdbSeasonSummariesParams) (int64, error) {
	return q.db.CopyFrom(ctx, []string{"ohfootball_raw", "ohhsfbdb_season_summaries"}, []string{"scrape_run_id", "sheet", "season", "conference", "regular_wins", "regular_losses", "regular_ties", "conference_wins", "conference_losses", "conference_ties", "playoff_wins", "playoff_losses", "division", "region", "rank"}, &iteratorForInsertOhhsfbdbSeasonSummaries{rows: arg})
}
