package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/StephenODea54/services/api/graph/model"
	"github.com/StephenODea54/services/api/internal/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	defaultLimit = 1000
	maxLimit     = 1000
)

// Postgres reads the marts through the shared database client. The client owns the connection
// pool, so every service of this repository connects in the same way.
type Postgres struct {
	client *database.Client
}

func Open(ctx context.Context, databaseURL string) (*Postgres, error) {
	client, err := database.Open(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	return &Postgres{client: client}, nil
}

func (store *Postgres) Close() {
	store.client.Close()
}

func (store *Postgres) Ping(ctx context.Context) error {
	return store.client.Ping(ctx)
}

// Seasons lists every season the marts hold for Ohio, newest first. The season picker of the site
// reads this list, so a season that has no teams never appears as a choice.
func (store *Postgres) Seasons(ctx context.Context) ([]int, error) {
	rows, err := store.client.Query(ctx, `
		SELECT DISTINCT season
		FROM ohfootball_marts.dim_teams
		WHERE is_current
		  AND state_code = 'OH'
		ORDER BY season DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("select seasons: %w", err)
	}
	defer rows.Close()

	seasons := make([]int, 0)
	for rows.Next() {
		var season int
		if err := rows.Scan(&season); err != nil {
			return nil, fmt.Errorf("scan season: %w", err)
		}
		seasons = append(seasons, season)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read seasons: %w", err)
	}
	return seasons, nil
}

func (store *Postgres) CurrentSeason(ctx context.Context) (int, error) {
	var season int
	err := store.client.QueryRow(ctx, `
		SELECT MAX(season)
		FROM ohfootball_marts.dim_teams
		WHERE is_current
		  AND state_code = 'OH'
	`).Scan(&season)
	if err != nil {
		return 0, fmt.Errorf("select current season: %w", err)
	}
	return season, nil
}

func (store *Postgres) ListTeams(
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
	search, sort, limit := listTeamsArguments(searchArgument, sortArgument, limitArgument)

	rows, err := store.client.Query(
		ctx,
		listTeamsSQL,
		season,
		search,
		regionArgument,
		divisionArgument,
		sort,
		limit,
	)
	if err != nil {
		return nil, fmt.Errorf("list teams: %w", err)
	}
	defer rows.Close()

	teams := make([]*model.Team, 0)
	for rows.Next() {
		team, err := scanTeam(rows)
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
func (store *Postgres) Team(ctx context.Context, id string, season *int) (*model.Team, error) {
	var sourceID string
	var keySeason int
	if err := store.client.QueryRow(ctx, `
		SELECT source_id, season
		FROM ohfootball_marts.dim_teams
		WHERE is_current AND team_key = $1::uuid
	`, id).Scan(&sourceID, &keySeason); errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	} else if err != nil {
		return nil, fmt.Errorf("select team program: %w", err)
	}

	requestedSeason := keySeason
	if season != nil {
		requestedSeason = *season
	}

	row := store.client.QueryRow(ctx, teamSQL, requestedSeason, sourceID)
	team, err := scanTeam(row)
	if errors.Is(err, pgx.ErrNoRows) {
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
	team.RatingHistory = history
	team.Schedule = schedule
	return team, nil
}

func (store *Postgres) resolveSeason(ctx context.Context, season *int) (int, error) {
	if season != nil {
		return *season, nil
	}
	return store.CurrentSeason(ctx)
}

type rowScanner interface {
	Scan(...any) error
}

// optional returns a pointer to the value, or nil when the column held no value. A nullable field
// of the schema carries a pointer, so a missing value stays missing.
func optional[T any](valid bool, value T) *T {
	if !valid {
		return nil
	}
	return &value
}

// listTeamsArguments applies the defaults of the teams query. A nil argument carries no value, so
// the default takes its place. Both stores read the same defaults, so the same query answers the
// same way against the warehouse and against a snapshot.
func listTeamsArguments(search *string, sort *model.TeamSort, limit *int) (string, string, int) {
	searchTerm := ""
	if search != nil {
		searchTerm = *search
	}
	sortOrder := model.TeamSortRating
	if sort != nil {
		sortOrder = *sort
	}
	rowLimit := defaultLimit
	if limit != nil {
		rowLimit = max(1, min(*limit, maxLimit))
	}
	return searchTerm, string(sortOrder), rowLimit
}

func scanTeam(row rowScanner) (*model.Team, error) {
	var team model.Team
	var mascot, city, primaryColor, secondaryColor pgtype.Text
	var division, region pgtype.Int2
	var rating, relativeRating pgtype.Float8
	var ratingRank, previousRank pgtype.Int8
	var asOf pgtype.Date
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
		&relativeRating,
		&ratingRank,
		&asOf,
		&previousRank,
	); err != nil {
		return nil, err
	}
	team.Mascot = optional(mascot.Valid, mascot.String)
	team.City = optional(city.Valid, city.String)
	team.Division = optional(division.Valid, int(division.Int16))
	team.Region = optional(region.Valid, int(region.Int16))
	team.PrimaryColor = optional(primaryColor.Valid, primaryColor.String)
	team.SecondaryColor = optional(secondaryColor.Valid, secondaryColor.String)
	team.Record = &model.Record{Wins: int(wins), Losses: int(losses), Ties: int(ties)}
	team.RatingHistory = []*model.TeamRating{}
	team.Schedule = []*model.Game{}
	if rating.Valid && relativeRating.Valid && ratingRank.Valid && asOf.Valid {
		team.Rating = &model.TeamRating{
			Season:         team.Season,
			Rating:         rating.Float64,
			RelativeRating: relativeRating.Float64,
			Rank:           int(ratingRank.Int64),
			PreviousRank:   optional(previousRank.Valid, int(previousRank.Int64)),
			AsOf:           asOf.Time.Format(time.DateOnly),
		}
	}
	return &team, nil
}

func (store *Postgres) ratingHistory(ctx context.Context, sourceID string) ([]*model.TeamRating, error) {
	rows, err := store.client.Query(ctx, ratingHistorySQL, sourceID)
	if err != nil {
		return nil, fmt.Errorf("select rating history: %w", err)
	}
	defer rows.Close()

	history := make([]*model.TeamRating, 0)
	for rows.Next() {
		rating, err := scanRating(rows)
		if err != nil {
			return nil, fmt.Errorf("scan rating history: %w", err)
		}
		history = append(history, rating)
	}
	return history, rows.Err()
}

func scanRating(row rowScanner) (*model.TeamRating, error) {
	var rating model.TeamRating
	var asOf time.Time
	var rank int64
	var previousRank pgtype.Int8
	if err := row.Scan(
		&rating.Season,
		&rating.Rating,
		&rating.RelativeRating,
		&rank,
		&previousRank,
		&asOf,
	); err != nil {
		return nil, err
	}
	rating.Rank = int(rank)
	rating.PreviousRank = optional(previousRank.Valid, int(previousRank.Int64))
	rating.AsOf = asOf.Format(time.DateOnly)
	return &rating, nil
}

func (store *Postgres) schedule(ctx context.Context, teamID string, season int) ([]*model.Game, error) {
	rows, err := store.client.Query(ctx, scheduleSQL, teamID, season)
	if err != nil {
		return nil, fmt.Errorf("select schedule: %w", err)
	}
	defer rows.Close()

	games := make([]*model.Game, 0)
	for rows.Next() {
		var game model.Game
		var gameDate time.Time
		var rawLocation, rawResult string
		var teamScore, opponentScore pgtype.Int2
		var notes pgtype.Text
		var teamRating, opponentRating, probability, margin pgtype.Float8
		var predictionDate pgtype.Date
		if err := rows.Scan(
			&game.ID,
			&gameDate,
			&game.OpponentID,
			&game.OpponentName,
			&rawLocation,
			&rawResult,
			&teamScore,
			&opponentScore,
			&game.Playoff,
			&notes,
			&teamRating,
			&opponentRating,
			&probability,
			&margin,
			&predictionDate,
		); err != nil {
			return nil, fmt.Errorf("scan schedule: %w", err)
		}
		game.Week = len(games) + 1
		game.Date = gameDate.Format(time.DateOnly)
		game.Location = model.GameLocation(rawLocation)
		game.Result = result(rawResult)
		game.TeamScore = optional(teamScore.Valid, int(teamScore.Int16))
		game.OpponentScore = optional(opponentScore.Valid, int(opponentScore.Int16))
		game.Notes = optional(notes.Valid, notes.String)
		game.Prediction = predictionFor(
			game.Result, teamRating, opponentRating, probability, margin, predictionDate,
		)
		games = append(games, &game)
	}
	return games, rows.Err()
}

func result(raw string) model.GameResult {
	switch raw {
	case "W":
		return model.GameResultWin
	case "L":
		return model.GameResultLoss
	case "T":
		return model.GameResultTie
	case "C":
		return model.GameResultCanceled
	default:
		return model.GameResultUnknown
	}
}

// predictionFor reads the stored prediction of a game. The rating job stores a prediction for each
// played game, made from the ratings both teams carried into it, and for each game of the season in
// progress not yet played. A row from before the margin rating has no margin, so it gives no
// prediction. A canceled game gives none, because its row can come from before it was canceled.
func predictionFor(
	result model.GameResult,
	teamRating, opponentRating, probability, margin pgtype.Float8,
	predictionDate pgtype.Date,
) *model.GamePrediction {
	if result == model.GameResultCanceled {
		return nil
	}
	if !teamRating.Valid || !opponentRating.Valid || !probability.Valid || !margin.Valid || !predictionDate.Valid {
		return nil
	}
	return buildPrediction(
		probability.Float64,
		margin.Float64,
		teamRating.Float64,
		opponentRating.Float64,
		predictionDate.Time.Format(time.DateOnly),
	)
}

func buildPrediction(probability, margin, teamRating, opponentRating float64, asOf string) *model.GamePrediction {
	predictedResult := model.GameResultLoss
	if probability >= 0.5 {
		predictedResult = model.GameResultWin
	}
	return &model.GamePrediction{
		WinProbability:  probability,
		PredictedResult: predictedResult,
		PredictedMargin: margin,
		TeamRating:      teamRating,
		OpponentRating:  opponentRating,
		AsOf:            asOf,
	}
}

const teamFacts = `
	WITH team_results AS (
		SELECT team_a_key AS team_key, team_a_result AS result
		FROM ohfootball_marts.fct_games
		WHERE is_current AND season = $1
		UNION ALL
		SELECT team_b_key AS team_key, team_b_result AS result
		FROM ohfootball_marts.fct_games
		WHERE is_current AND season = $1
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
		FROM ohfootball_marts.fct_team_ratings
		WHERE season = $1
	),
	ratings AS (
		SELECT
			rating.team_key,
			rating.rating,
			rating.relative_rating,
			rating.as_of_date,
			RANK() OVER (ORDER BY rating.rating DESC) AS rating_rank
		FROM ohfootball_marts.fct_team_ratings AS rating
		INNER JOIN latest_snapshot USING (as_of_date)
		WHERE rating.season = $1
	),
	previous_snapshot AS (
		SELECT MAX(rating.as_of_date) AS as_of_date
		FROM ohfootball_marts.fct_team_ratings AS rating
		CROSS JOIN latest_snapshot
		WHERE rating.season = $1
		  AND rating.as_of_date < latest_snapshot.as_of_date
	),
	previous_ratings AS (
		SELECT
			rating.team_key,
			RANK() OVER (ORDER BY rating.rating DESC) AS rating_rank
		FROM ohfootball_marts.fct_team_ratings AS rating
		INNER JOIN previous_snapshot USING (as_of_date)
		WHERE rating.season = $1
	)
`

const teamColumns = `
	team.team_key::text,
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
	ratings.rating,
	ratings.relative_rating,
	ratings.rating_rank,
	ratings.as_of_date,
	previous_ratings.rating_rank
`

var listTeamsSQL = teamFacts + `
	SELECT ` + teamColumns + `
	FROM ohfootball_marts.dim_teams AS team
	LEFT JOIN records USING (team_key)
	LEFT JOIN ratings USING (team_key)
	LEFT JOIN previous_ratings USING (team_key)
	WHERE team.is_current
	  AND team.state_code = 'OH'
	  AND team.season = $1
	  AND (
		$2 = ''
		OR team.name ILIKE '%' || $2 || '%'
		OR COALESCE(team.mascot, '') ILIKE '%' || $2 || '%'
		OR COALESCE(team.city, '') ILIKE '%' || $2 || '%'
	  )
	  AND ($3::smallint IS NULL OR team.region = $3::smallint)
	  AND ($4::smallint IS NULL OR team.division = $4::smallint)
	ORDER BY
		CASE WHEN $5 = 'RATING' THEN ratings.rating END DESC NULLS LAST,
		team.name,
		team.team_key
	LIMIT $6
`

var teamSQL = teamFacts + `
	SELECT ` + teamColumns + `
	FROM ohfootball_marts.dim_teams AS team
	LEFT JOIN records USING (team_key)
	LEFT JOIN ratings USING (team_key)
	LEFT JOIN previous_ratings USING (team_key)
	WHERE team.is_current
	  AND team.season = $1
	  AND team.source_id = $2
`

// The weekly run publishes a snapshot for each week of the season in progress. A past season keeps
// the weekly snapshots it had and ends with one on 31 December. The history therefore follows the
// program through every snapshot of every season it has played. The previous rank of a point is
// the rank of the same team at its snapshot before that one in the same season.
const ratingHistorySQL = `
	WITH program_seasons AS (
		SELECT team_key
		FROM ohfootball_marts.dim_teams
		WHERE is_current AND source_id = $1
	),
	ranked AS (
		SELECT
			rating.team_key,
			rating.season,
			rating.rating,
			rating.relative_rating,
			rating.as_of_date,
			RANK() OVER (
				PARTITION BY rating.season, rating.as_of_date
				ORDER BY rating.rating DESC
			) AS rating_rank
		FROM ohfootball_marts.fct_team_ratings AS rating
	)
	SELECT
		ranked.season,
		ranked.rating,
		ranked.relative_rating,
		ranked.rating_rank,
		LAG(ranked.rating_rank) OVER (
			PARTITION BY ranked.team_key, ranked.season
			ORDER BY ranked.as_of_date
		) AS previous_rank,
		ranked.as_of_date
	FROM ranked
	INNER JOIN program_seasons USING (team_key)
	ORDER BY ranked.season, ranked.as_of_date
`

const scheduleSQL = `
	SELECT
		game.game_key::text,
		date.date_day,
		opponent.team_key::text,
		opponent.name,
		CASE
			WHEN game.team_a_key = $1::uuid AND game.is_team_a_home THEN 'HOME'
			WHEN game.team_b_key = $1::uuid AND game.is_team_b_home THEN 'HOME'
			WHEN game.team_a_key = $1::uuid AND game.is_team_b_home THEN 'AWAY'
			WHEN game.team_b_key = $1::uuid AND game.is_team_a_home THEN 'AWAY'
			ELSE 'NEUTRAL'
		END AS location,
		CASE WHEN game.team_a_key = $1::uuid THEN game.team_a_result ELSE game.team_b_result END,
		CASE WHEN game.team_a_key = $1::uuid THEN game.team_a_score ELSE game.team_b_score END,
		CASE WHEN game.team_a_key = $1::uuid THEN game.team_b_score ELSE game.team_a_score END,
		game.is_playoff_game,
		game.notes,
		CASE
			WHEN game.team_a_key = $1::uuid THEN prediction.team_a_rating
			ELSE prediction.team_b_rating
		END AS pregame_team_rating,
		CASE
			WHEN game.team_a_key = $1::uuid THEN prediction.team_b_rating
			ELSE prediction.team_a_rating
		END AS pregame_opponent_rating,
		CASE
			WHEN game.team_a_key = $1::uuid THEN prediction.team_a_win_probability
			ELSE 1 - prediction.team_a_win_probability
		END AS pregame_win_probability,
		CASE
			WHEN game.team_a_key = $1::uuid THEN prediction.predicted_margin
			ELSE -prediction.predicted_margin
		END AS predicted_margin,
		prediction.as_of_date
	FROM ohfootball_marts.fct_games AS game
	INNER JOIN ohfootball_marts.dim_dates AS date
		ON date.date_key = game.game_date_key
	INNER JOIN ohfootball_marts.dim_teams AS opponent
		ON opponent.team_key = CASE
			WHEN game.team_a_key = $1::uuid THEN game.team_b_key
			ELSE game.team_a_key
		END
	   AND opponent.is_current
	LEFT JOIN ohfootball_marts.fct_game_predictions AS prediction
		ON prediction.game_key = game.game_key
	WHERE game.is_current
	  AND game.season = $2
	  AND (game.team_a_key = $1::uuid OR game.team_b_key = $1::uuid)
	ORDER BY date.date_day, game.game_key
`
