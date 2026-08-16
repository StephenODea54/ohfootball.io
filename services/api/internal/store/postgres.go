package store

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/StephenODea54/pkg/database"
	"github.com/StephenODea54/services/api/graph/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	defaultLimit = 1000
	maxLimit     = 1000
)

type PredictionConfig struct {
	HomeAdvantage float64
	RatingScale   float64
}

// Postgres reads the marts through the shared database client. The client owns the connection
// pool, so every service of this repository connects in the same way.
type Postgres struct {
	client     *database.Client
	prediction PredictionConfig
}

func Open(ctx context.Context, databaseURL string, prediction PredictionConfig) (*Postgres, error) {
	if prediction.RatingScale <= 0 {
		return nil, errors.New("Elo rating scale must be greater than zero")
	}
	client, err := database.Open(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	return &Postgres{client: client, prediction: prediction}, nil
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

	rows, err := store.client.Query(
		ctx,
		listTeamsSQL,
		season,
		search,
		regionArgument,
		divisionArgument,
		string(sort),
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
	team.EloHistory = history
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

func scanTeam(row rowScanner) (*model.Team, error) {
	var team model.Team
	var mascot, city, primaryColor, secondaryColor pgtype.Text
	var division, region pgtype.Int2
	var rating pgtype.Float8
	var ratingRank pgtype.Int8
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
		value := int(division.Int16)
		team.Division = &value
	}
	if region.Valid {
		value := int(region.Int16)
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
			AsOf:   asOf.Time.Format(time.DateOnly),
		}
	}
	return &team, nil
}

func (store *Postgres) ratingHistory(ctx context.Context, sourceID string) ([]*model.EloRating, error) {
	rows, err := store.client.Query(ctx, ratingHistorySQL, sourceID)
	if err != nil {
		return nil, fmt.Errorf("select rating history: %w", err)
	}
	defer rows.Close()

	history := make([]*model.EloRating, 0)
	for rows.Next() {
		var rating model.EloRating
		var asOf time.Time
		var rank int64
		if err := rows.Scan(&rating.Season, &rating.Rating, &rank, &asOf); err != nil {
			return nil, fmt.Errorf("scan rating history: %w", err)
		}
		rating.Rank = int(rank)
		rating.AsOf = asOf.Format(time.DateOnly)
		history = append(history, &rating)
	}
	return history, rows.Err()
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
		var teamRating, opponentRating pgtype.Float8
		var ratingDate pgtype.Date
		var pregameTeamRating, pregameOpponentRating, pregameProbability pgtype.Float8
		var pregameDate pgtype.Date
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
			&ratingDate,
			&pregameTeamRating,
			&pregameOpponentRating,
			&pregameProbability,
			&pregameDate,
		); err != nil {
			return nil, fmt.Errorf("scan schedule: %w", err)
		}
		game.Week = len(games) + 1
		game.Date = gameDate.Format(time.DateOnly)
		game.Location = model.GameLocation(rawLocation)
		game.Result = result(rawResult)
		if teamScore.Valid {
			value := int(teamScore.Int16)
			game.TeamScore = &value
		}
		if opponentScore.Valid {
			value := int(opponentScore.Int16)
			game.OpponentScore = &value
		}
		if notes.Valid {
			game.Notes = &notes.String
		}
		switch {
		// A played game keeps the prediction that was made from the ratings both teams carried
		// into it, so the page shows what was expected rather than hindsight.
		case pregameProbability.Valid && pregameTeamRating.Valid && pregameOpponentRating.Valid && pregameDate.Valid:
			game.Prediction = buildPrediction(
				pregameProbability.Float64,
				pregameTeamRating.Float64,
				pregameOpponentRating.Float64,
				pregameDate.Time,
			)
		// An unplayed game has no stored prediction, so it is estimated from the latest ratings.
		case game.Result == model.GameResultUnknown && teamRating.Valid && opponentRating.Valid && ratingDate.Valid:
			game.Prediction = buildPrediction(
				winProbability(
					teamRating.Float64,
					opponentRating.Float64,
					game.Location,
					store.prediction,
				),
				teamRating.Float64,
				opponentRating.Float64,
				ratingDate.Time,
			)
		}
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

func buildPrediction(probability, teamRating, opponentRating float64, asOf time.Time) *model.GamePrediction {
	predictedResult := model.GameResultLoss
	if probability >= 0.5 {
		predictedResult = model.GameResultWin
	}
	return &model.GamePrediction{
		WinProbability:  probability,
		PredictedResult: predictedResult,
		TeamRating:      teamRating,
		OpponentRating:  opponentRating,
		AsOf:            asOf.Format(time.DateOnly),
	}
}

func winProbability(teamRating, opponentRating float64, location model.GameLocation, config PredictionConfig) float64 {
	if location == model.GameLocationHome {
		teamRating += config.HomeAdvantage
	} else if location == model.GameLocationAway {
		opponentRating += config.HomeAdvantage
	}
	return 1 / (1 + math.Pow(10, (opponentRating-teamRating)/config.RatingScale))
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
		FROM ohfootball_marts.fct_team_elo_ratings
		WHERE season = $1
	),
	ratings AS (
		SELECT
			rating.team_key,
			rating.elo_rating,
			rating.as_of_date,
			RANK() OVER (ORDER BY rating.elo_rating DESC) AS rating_rank
		FROM ohfootball_marts.fct_team_elo_ratings AS rating
		INNER JOIN latest_snapshot USING (as_of_date)
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
	ratings.elo_rating,
	ratings.rating_rank,
	ratings.as_of_date
`

var listTeamsSQL = teamFacts + `
	SELECT ` + teamColumns + `
	FROM ohfootball_marts.dim_teams AS team
	LEFT JOIN records USING (team_key)
	LEFT JOIN ratings USING (team_key)
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
		CASE WHEN $5 = 'ELO' THEN ratings.elo_rating END DESC NULLS LAST,
		team.name,
		team.team_key
	LIMIT $6
`

var teamSQL = teamFacts + `
	SELECT ` + teamColumns + `
	FROM ohfootball_marts.dim_teams AS team
	LEFT JOIN records USING (team_key)
	LEFT JOIN ratings USING (team_key)
	WHERE team.is_current
	  AND team.season = $1
	  AND team.source_id = $2
`

// Ratings are published as one snapshot per season, so a single season holds a single point. The
// history therefore follows the program across every season it has played.
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
			rating.elo_rating,
			rating.as_of_date,
			RANK() OVER (
				PARTITION BY rating.season, rating.as_of_date
				ORDER BY rating.elo_rating DESC
			) AS rating_rank
		FROM ohfootball_marts.fct_team_elo_ratings AS rating
	)
	SELECT ranked.season, ranked.elo_rating, ranked.rating_rank, ranked.as_of_date
	FROM ranked
	INNER JOIN program_seasons USING (team_key)
	ORDER BY ranked.season, ranked.as_of_date
`

const scheduleSQL = `
	WITH latest_snapshot AS (
		SELECT MAX(as_of_date) AS as_of_date
		FROM ohfootball_marts.fct_team_elo_ratings
		WHERE season = $2
	),
	ratings AS (
		SELECT rating.team_key, rating.elo_rating, rating.as_of_date
		FROM ohfootball_marts.fct_team_elo_ratings AS rating
		INNER JOIN latest_snapshot USING (as_of_date)
		WHERE rating.season = $2
	)
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
		team_rating.elo_rating,
		opponent_rating.elo_rating,
		team_rating.as_of_date,
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
		prediction.game_date
	FROM ohfootball_marts.fct_games AS game
	INNER JOIN ohfootball_marts.dim_dates AS date
		ON date.date_key = game.game_date_key
	INNER JOIN ohfootball_marts.dim_teams AS opponent
		ON opponent.team_key = CASE
			WHEN game.team_a_key = $1::uuid THEN game.team_b_key
			ELSE game.team_a_key
		END
	   AND opponent.is_current
	LEFT JOIN ratings AS team_rating
		ON team_rating.team_key = $1::uuid
	LEFT JOIN ratings AS opponent_rating
		ON opponent_rating.team_key = opponent.team_key
	LEFT JOIN ohfootball_marts.fct_game_predictions AS prediction
		ON prediction.game_key = game.game_key
	WHERE game.is_current
	  AND game.season = $2
	  AND (game.team_a_key = $1::uuid OR game.team_b_key = $1::uuid)
	ORDER BY date.date_day, game.game_key
`
