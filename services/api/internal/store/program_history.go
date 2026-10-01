package store

import (
	"context"
	"fmt"
	"time"

	"github.com/StephenODea54/services/api/graph/model"
	"github.com/jackc/pgx/v5/pgtype"
)

// The end-of-season snapshot of a season is its last snapshot. For a past season the rating job
// writes it on 31 December. For the season in progress it is the last weekly run, so the row of
// that season equals the rating and the rank in the header of the team. The rank counts every
// team in the snapshot, as the leaderboard does. The record counts the games with a result, as
// the record of the team does. The history holds only the seasons in which the program is recorded
// as an Ohio team. A source id can also have rows in another state, and those seasons have no
// Ohio rating to compare.
const programHistorySQL = `
	WITH program AS (
		SELECT team_key, season
		FROM ohfootball_marts.dim_teams
		WHERE is_current
		  AND source_id = $1
		  AND state_code = 'OH'
	),
	season_end AS (
		SELECT season, MAX(as_of_date) AS as_of_date
		FROM ohfootball_marts.fct_team_ratings
		GROUP BY season
	),
	ranked AS (
		SELECT
			rating.team_key,
			rating.rating,
			rating.relative_rating,
			rating.as_of_date,
			RANK() OVER (PARTITION BY rating.season ORDER BY rating.rating DESC) AS rating_rank
		FROM ohfootball_marts.fct_team_ratings AS rating
		INNER JOIN season_end USING (season, as_of_date)
	),
	games AS (
		SELECT
			program.team_key,
			COUNT(*) FILTER (WHERE game.result = 'W') AS wins,
			COUNT(*) FILTER (WHERE game.result = 'L') AS losses,
			COUNT(*) FILTER (WHERE game.result = 'T') AS ties,
			COUNT(*) FILTER (WHERE game.is_playoff_game AND game.result = 'W') AS playoff_wins,
			COUNT(*) FILTER (WHERE game.is_playoff_game AND game.result = 'L') AS playoff_losses,
			COUNT(*) FILTER (WHERE game.is_playoff_game AND game.result = 'T') AS playoff_ties
		FROM program
		INNER JOIN LATERAL (
			SELECT
				game.is_playoff_game,
				CASE
					WHEN game.team_a_key = program.team_key THEN game.team_a_result
					ELSE game.team_b_result
				END AS result
			FROM ohfootball_marts.fct_games AS game
			WHERE game.is_current
			  AND game.season = program.season
			  AND (game.team_a_key = program.team_key OR game.team_b_key = program.team_key)
		) AS game ON TRUE
		GROUP BY program.team_key
	)
	SELECT
		program.season,
		COALESCE(games.wins, 0),
		COALESCE(games.losses, 0),
		COALESCE(games.ties, 0),
		COALESCE(games.playoff_wins, 0),
		COALESCE(games.playoff_losses, 0),
		COALESCE(games.playoff_ties, 0),
		ranked.rating,
		ranked.relative_rating,
		ranked.rating_rank,
		ranked.as_of_date
	FROM program
	LEFT JOIN games USING (team_key)
	LEFT JOIN ranked USING (team_key)
	ORDER BY program.season
`

// programHistory reads every Ohio season of one program, oldest first. The source id follows the
// program across the seasons, because each season has a team key of its own.
func (store *Postgres) programHistory(ctx context.Context, sourceID string) ([]*model.ProgramSeason, error) {
	rows, err := store.client.Query(ctx, programHistorySQL, sourceID)
	if err != nil {
		return nil, fmt.Errorf("select program history: %w", err)
	}
	defer rows.Close()

	history := make([]*model.ProgramSeason, 0)
	for rows.Next() {
		season, err := scanProgramSeason(rows)
		if err != nil {
			return nil, fmt.Errorf("scan program history: %w", err)
		}
		history = append(history, season)
	}
	return history, rows.Err()
}

// scanProgramSeason reads one row of programHistorySQL. A season without an end-of-season snapshot
// has no rating. The record is still read, because the games exist.
func scanProgramSeason(row rowScanner) (*model.ProgramSeason, error) {
	var season model.ProgramSeason
	var wins, losses, ties, playoffWins, playoffLosses, playoffTies int64
	var rating, relativeRating pgtype.Float8
	var rank pgtype.Int8
	var asOf pgtype.Date
	if err := row.Scan(
		&season.Season,
		&wins,
		&losses,
		&ties,
		&playoffWins,
		&playoffLosses,
		&playoffTies,
		&rating,
		&relativeRating,
		&rank,
		&asOf,
	); err != nil {
		return nil, err
	}
	season.Record = &model.Record{Wins: int(wins), Losses: int(losses), Ties: int(ties)}
	season.PlayoffRecord = &model.Record{
		Wins:   int(playoffWins),
		Losses: int(playoffLosses),
		Ties:   int(playoffTies),
	}
	if rating.Valid && relativeRating.Valid && rank.Valid && asOf.Valid {
		season.Rating = &model.TeamRating{
			Season:         season.Season,
			Rating:         rating.Float64,
			RelativeRating: relativeRating.Float64,
			Rank:           int(rank.Int64),
			AsOf:           asOf.Time.Format(time.DateOnly),
		}
	}
	return &season, nil
}
