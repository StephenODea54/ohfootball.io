package store

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"

	"github.com/StephenODea54/services/api/graph/model"
	// The pure Go driver keeps the binary free of cgo, so the API still cross compiles to a
	// static binary for the deployed runtime.
	_ "modernc.org/sqlite"
)

// SQLiteSchema is the table and index definition of the snapshot file. The step that writes the
// file uses it, and so does every test that builds a snapshot to read from.
//
//go:embed schema.sql
var SQLiteSchema string

// sqliteMaxOpenConns bounds the read handles held against the snapshot. The file is read only, so
// handles never contend for a write lock.
const sqliteMaxOpenConns = 4

// SQLite reads the marts from a snapshot file instead of from the warehouse. It answers the same
// questions as Postgres and returns the same models.
type SQLite struct {
	db         *sql.DB
	prediction PredictionConfig
}

// OpenSQLite opens a snapshot for reading. The file is opened read only and immutable, which lets
// SQLite skip its locking and change detection work. The caller must not write to the file, or to
// any journal beside it, while the store is open.
func OpenSQLite(path string, prediction PredictionConfig) (*SQLite, error) {
	if prediction.RatingScale <= 0 {
		return nil, errors.New("Elo rating scale must be greater than zero")
	}
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro&immutable=1")
	if err != nil {
		return nil, fmt.Errorf("configure sqlite: %w", err)
	}
	db.SetMaxOpenConns(sqliteMaxOpenConns)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("open snapshot %s: %w", path, err)
	}
	return &SQLite{db: db, prediction: prediction}, nil
}

func (store *SQLite) Close() error {
	return store.db.Close()
}

func (store *SQLite) Ping(ctx context.Context) error {
	return store.db.PingContext(ctx)
}

func (store *SQLite) CurrentSeason(ctx context.Context) (int, error) {
	var season sql.NullInt64
	err := store.db.QueryRowContext(ctx, `
		SELECT MAX(season)
		FROM dim_teams
		WHERE state_code = 'OH'
	`).Scan(&season)
	if err != nil {
		return 0, fmt.Errorf("select current season: %w", err)
	}
	if !season.Valid {
		return 0, errors.New("the snapshot holds no Ohio teams")
	}
	return int(season.Int64), nil
}

func (store *SQLite) ListTeams(
	ctx context.Context,
	seasonArgument *int,
	searchArgument *string,
	regionArgument *int,
	divisionArgument *int,
	sortArgument *model.TeamSort,
	limitArgument *int,
) ([]*model.Team, error) {
	season, err := store.resolveSeason(ctx, seasonArgument)
	if err != nil {
		return nil, err
	}
	search := ""
	if searchArgument != nil {
		search = *searchArgument
	}
	sort := model.TeamSortElo
	if sortArgument != nil {
		sort = *sortArgument
	}
	limit := defaultLimit
	if limitArgument != nil {
		limit = max(1, min(*limitArgument, maxLimit))
	}

	rows, err := store.db.QueryContext(
		ctx,
		sqliteListTeamsSQL,
		sql.Named("season", season),
		sql.Named("search", search),
		sql.Named("region", regionArgument),
		sql.Named("division", divisionArgument),
		sql.Named("sort", string(sort)),
		sql.Named("limit", limit),
	)
	if err != nil {
		return nil, fmt.Errorf("list teams: %w", err)
	}
	defer rows.Close()

	teams := make([]*model.Team, 0)
	for rows.Next() {
		team, err := scanSQLiteTeam(rows)
		if err != nil {
			return nil, fmt.Errorf("scan team: %w", err)
		}
		teams = append(teams, team)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list teams rows: %w", err)
	}
	return teams, nil
}

// Team returns one team season. A team key belongs to a single season, so the source id is used to
// follow the same program into the requested season. Without a season, the key's own season is
// used.
func (store *SQLite) Team(ctx context.Context, id string, season *int) (*model.Team, error) {
	var sourceID string
	var keySeason int
	err := store.db.QueryRowContext(ctx, `
		SELECT source_id, season
		FROM dim_teams
		WHERE team_key = :team_key
	`, sql.Named("team_key", id)).Scan(&sourceID, &keySeason)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	} else if err != nil {
		return nil, fmt.Errorf("select team program: %w", err)
	}

	requestedSeason := keySeason
	if season != nil {
		requestedSeason = *season
	}

	row := store.db.QueryRowContext(
		ctx,
		sqliteTeamSQL,
		sql.Named("season", requestedSeason),
		sql.Named("source_id", sourceID),
	)
	team, err := scanSQLiteTeam(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("select team: %w", err)
	}

	history, err := store.ratingHistory(ctx, sourceID)
	if err != nil {
		return nil, err
	}
	schedule, err := store.schedule(ctx, team.ID, team.Season)
	if err != nil {
		return nil, err
	}
	team.EloHistory = history
	team.Schedule = schedule
	return team, nil
}

func (store *SQLite) resolveSeason(ctx context.Context, season *int) (int, error) {
	if season != nil {
		return *season, nil
	}
	return store.CurrentSeason(ctx)
}

func scanSQLiteTeam(row rowScanner) (*model.Team, error) {
	var team model.Team
	var mascot, city, primaryColor, secondaryColor, asOf sql.NullString
	var division, region, ratingRank sql.NullInt64
	var rating sql.NullFloat64
	var wins, losses, ties int64
	if err := row.Scan(
		&team.ID,
		&team.Season,
		&team.Name,
		&mascot,
		&city,
		&division,
		&region,
		&primaryColor,
		&secondaryColor,
		&wins,
		&losses,
		&ties,
		&rating,
		&ratingRank,
		&asOf,
	); err != nil {
		return nil, err
	}
	if mascot.Valid {
		team.Mascot = &mascot.String
	}
	if city.Valid {
		team.City = &city.String
	}
	if division.Valid {
		value := int(division.Int64)
		team.Division = &value
	}
	if region.Valid {
		value := int(region.Int64)
		team.Region = &value
	}
	if primaryColor.Valid {
		team.PrimaryColor = &primaryColor.String
	}
	if secondaryColor.Valid {
		team.SecondaryColor = &secondaryColor.String
	}
	team.Record = &model.Record{Wins: int(wins), Losses: int(losses), Ties: int(ties)}
	team.EloHistory = []*model.EloRating{}
	team.Schedule = []*model.Game{}
	if rating.Valid && ratingRank.Valid && asOf.Valid {
		team.Elo = &model.EloRating{
			Season: team.Season,
			Rating: rating.Float64,
			Rank:   int(ratingRank.Int64),
			AsOf:   asOf.String,
		}
	}
	return &team, nil
}

func (store *SQLite) ratingHistory(ctx context.Context, sourceID string) ([]*model.EloRating, error) {
	rows, err := store.db.QueryContext(
		ctx,
		sqliteRatingHistorySQL,
		sql.Named("source_id", sourceID),
	)
	if err != nil {
		return nil, fmt.Errorf("select rating history: %w", err)
	}
	defer rows.Close()

	history := make([]*model.EloRating, 0)
	for rows.Next() {
		var rating model.EloRating
		var rank int64
		if err := rows.Scan(&rating.Season, &rating.Rating, &rank, &rating.AsOf); err != nil {
			return nil, fmt.Errorf("scan rating history: %w", err)
		}
		rating.Rank = int(rank)
		history = append(history, &rating)
	}
	return history, rows.Err()
}

func (store *SQLite) schedule(ctx context.Context, teamID string, season int) ([]*model.Game, error) {
	rows, err := store.db.QueryContext(
		ctx,
		sqliteScheduleSQL,
		sql.Named("team_key", teamID),
		sql.Named("season", season),
	)
	if err != nil {
		return nil, fmt.Errorf("select schedule: %w", err)
	}
	defer rows.Close()

	games := make([]*model.Game, 0)
	for rows.Next() {
		var game model.Game
		var rawLocation, rawResult string
		var teamScore, opponentScore sql.NullInt64
		var notes sql.NullString
		var teamRating, opponentRating sql.NullFloat64
		var ratingDate sql.NullString
		var pregameTeamRating, pregameOpponentRating, pregameProbability sql.NullFloat64
		var pregameDate sql.NullString
		var playoff int64
		if err := rows.Scan(
			&game.ID,
			&game.Date,
			&game.OpponentID,
			&game.OpponentName,
			&rawLocation,
			&rawResult,
			&teamScore,
			&opponentScore,
			&playoff,
			&notes,
			&teamRating,
			&opponentRating,
			&ratingDate,
			&pregameTeamRating,
			&pregameOpponentRating,
			&pregameProbability,
			&pregameDate,
		); err != nil {
			return nil, fmt.Errorf("scan schedule: %w", err)
		}
		game.Week = len(games) + 1
		game.Playoff = playoff != 0
		game.Location = model.GameLocation(rawLocation)
		game.Result = result(rawResult)
		if teamScore.Valid {
			value := int(teamScore.Int64)
			game.TeamScore = &value
		}
		if opponentScore.Valid {
			value := int(opponentScore.Int64)
			game.OpponentScore = &value
		}
		if notes.Valid {
			game.Notes = &notes.String
		}
		switch {
		// A played game keeps the prediction that was made from the ratings both teams carried
		// into it, so the page shows what was expected rather than hindsight.
		case pregameProbability.Valid && pregameTeamRating.Valid && pregameOpponentRating.Valid && pregameDate.Valid:
			game.Prediction = buildSQLitePrediction(
				pregameProbability.Float64,
				pregameTeamRating.Float64,
				pregameOpponentRating.Float64,
				pregameDate.String,
			)
		// An unplayed game has no stored prediction, so it is estimated from the latest ratings.
		case game.Result == model.GameResultUnknown && teamRating.Valid && opponentRating.Valid && ratingDate.Valid:
			game.Prediction = buildSQLitePrediction(
				winProbability(
					teamRating.Float64,
					opponentRating.Float64,
					game.Location,
					store.prediction,
				),
				teamRating.Float64,
				opponentRating.Float64,
				ratingDate.String,
			)
		}
		games = append(games, &game)
	}
	return games, rows.Err()
}

// buildSQLitePrediction mirrors buildPrediction. Dates already arrive in the form the schema
// returns, so no date is formatted here.
func buildSQLitePrediction(probability, teamRating, opponentRating float64, asOf string) *model.GamePrediction {
	predictedResult := model.GameResultLoss
	if probability >= 0.5 {
		predictedResult = model.GameResultWin
	}
	return &model.GamePrediction{
		WinProbability:  probability,
		PredictedResult: predictedResult,
		TeamRating:      teamRating,
		OpponentRating:  opponentRating,
		AsOf:            asOf,
	}
}

// sqliteTeamFacts counts each team's record for a season and ranks every team by the rating from
// the latest snapshot of that season.
const sqliteTeamFacts = `
	WITH team_results AS (
		SELECT team_a_key AS team_key, team_a_result AS result
		FROM fct_games
		WHERE season = :season
		UNION ALL
		SELECT team_b_key AS team_key, team_b_result AS result
		FROM fct_games
		WHERE season = :season
	),
	records AS (
		SELECT
			team_key,
			COUNT(*) FILTER (WHERE result = 'W') AS wins,
			COUNT(*) FILTER (WHERE result = 'L') AS losses,
			COUNT(*) FILTER (WHERE result = 'T') AS ties
		FROM team_results
		GROUP BY team_key
	),
	latest_snapshot AS (
		SELECT MAX(as_of_date) AS as_of_date
		FROM fct_team_elo_ratings
		WHERE season = :season
	),
	ratings AS (
		SELECT
			rating.team_key,
			rating.elo_rating,
			rating.as_of_date,
			RANK() OVER (ORDER BY rating.elo_rating DESC) AS rating_rank
		FROM fct_team_elo_ratings AS rating
		INNER JOIN latest_snapshot USING (as_of_date)
		WHERE rating.season = :season
	)
`

const sqliteTeamColumns = `
	team.team_key,
	team.season,
	team.name,
	team.mascot,
	team.city,
	team.division,
	team.region,
	team.primary_color_hex,
	team.secondary_color_hex,
	COALESCE(records.wins, 0),
	COALESCE(records.losses, 0),
	COALESCE(records.ties, 0),
	ratings.elo_rating,
	ratings.rating_rank,
	ratings.as_of_date
`

// SQLite compares text with LIKE without regard to case for ASCII, which is what the Postgres
// store gets from ILIKE for the same names.
var sqliteListTeamsSQL = sqliteTeamFacts + `
	SELECT ` + sqliteTeamColumns + `
	FROM dim_teams AS team
	LEFT JOIN records USING (team_key)
	LEFT JOIN ratings USING (team_key)
	WHERE team.state_code = 'OH'
	  AND team.season = :season
	  AND (
		:search = ''
		OR team.name LIKE '%' || :search || '%'
		OR COALESCE(team.mascot, '') LIKE '%' || :search || '%'
		OR COALESCE(team.city, '') LIKE '%' || :search || '%'
	  )
	  AND (:region IS NULL OR team.region = :region)
	  AND (:division IS NULL OR team.division = :division)
	ORDER BY
		CASE WHEN :sort = 'ELO' THEN ratings.elo_rating END DESC NULLS LAST,
		team.name,
		team.team_key
	LIMIT :limit
`

var sqliteTeamSQL = sqliteTeamFacts + `
	SELECT ` + sqliteTeamColumns + `
	FROM dim_teams AS team
	LEFT JOIN records USING (team_key)
	LEFT JOIN ratings USING (team_key)
	WHERE team.season = :season
	  AND team.source_id = :source_id
`

// Ratings are published as one snapshot per season, so a single season holds a single point. The
// history therefore follows the program across every season it has played.
const sqliteRatingHistorySQL = `
	WITH program_seasons AS (
		SELECT team_key
		FROM dim_teams
		WHERE source_id = :source_id
	),
	ranked AS (
		SELECT
			rating.team_key,
			rating.season,
			rating.elo_rating,
			rating.as_of_date,
			RANK() OVER (
				PARTITION BY rating.season, rating.as_of_date
				ORDER BY rating.elo_rating DESC
			) AS rating_rank
		FROM fct_team_elo_ratings AS rating
	)
	SELECT ranked.season, ranked.elo_rating, ranked.rating_rank, ranked.as_of_date
	FROM ranked
	INNER JOIN program_seasons USING (team_key)
	ORDER BY ranked.season, ranked.as_of_date
`

const sqliteScheduleSQL = `
	WITH latest_snapshot AS (
		SELECT MAX(as_of_date) AS as_of_date
		FROM fct_team_elo_ratings
		WHERE season = :season
	),
	ratings AS (
		SELECT rating.team_key, rating.elo_rating, rating.as_of_date
		FROM fct_team_elo_ratings AS rating
		INNER JOIN latest_snapshot USING (as_of_date)
		WHERE rating.season = :season
	)
	SELECT
		game.game_key,
		calendar.date_day,
		opponent.team_key,
		opponent.name,
		CASE
			WHEN game.team_a_key = :team_key AND game.is_team_a_home THEN 'HOME'
			WHEN game.team_b_key = :team_key AND game.is_team_b_home THEN 'HOME'
			WHEN game.team_a_key = :team_key AND game.is_team_b_home THEN 'AWAY'
			WHEN game.team_b_key = :team_key AND game.is_team_a_home THEN 'AWAY'
			ELSE 'NEUTRAL'
		END AS location,
		CASE WHEN game.team_a_key = :team_key THEN game.team_a_result ELSE game.team_b_result END,
		CASE WHEN game.team_a_key = :team_key THEN game.team_a_score ELSE game.team_b_score END,
		CASE WHEN game.team_a_key = :team_key THEN game.team_b_score ELSE game.team_a_score END,
		game.is_playoff_game,
		game.notes,
		team_rating.elo_rating,
		opponent_rating.elo_rating,
		team_rating.as_of_date,
		CASE
			WHEN game.team_a_key = :team_key THEN prediction.team_a_rating
			ELSE prediction.team_b_rating
		END AS pregame_team_rating,
		CASE
			WHEN game.team_a_key = :team_key THEN prediction.team_b_rating
			ELSE prediction.team_a_rating
		END AS pregame_opponent_rating,
		CASE
			WHEN game.team_a_key = :team_key THEN prediction.team_a_win_probability
			ELSE 1 - prediction.team_a_win_probability
		END AS pregame_win_probability,
		prediction.game_date
	FROM fct_games AS game
	INNER JOIN dim_dates AS calendar
		ON calendar.date_key = game.game_date_key
	INNER JOIN dim_teams AS opponent
		ON opponent.team_key = CASE
			WHEN game.team_a_key = :team_key THEN game.team_b_key
			ELSE game.team_a_key
		END
	LEFT JOIN ratings AS team_rating
		ON team_rating.team_key = :team_key
	LEFT JOIN ratings AS opponent_rating
		ON opponent_rating.team_key = opponent.team_key
	LEFT JOIN fct_game_predictions AS prediction
		ON prediction.game_key = game.game_key
	WHERE game.season = :season
	  AND (game.team_a_key = :team_key OR game.team_b_key = :team_key)
	ORDER BY calendar.date_day, game.game_key
`
