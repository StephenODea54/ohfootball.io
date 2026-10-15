package store

import (
	"context"
	"fmt"
	"time"

	"github.com/StephenODea54/services/api/graph/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	// playoffCacheTTL is how long an answer of PlayoffProjection is kept. A projection changes
	// once a week.
	playoffCacheTTL  = 10 * time.Minute
	playoffCacheSize = 16
	// playoffLoadTimeout bounds one load. A load is shared by every caller that waits for it,
	// so it does not stop when one caller goes away.
	playoffLoadTimeout = 30 * time.Second
	// firstPlayoffSeason is the first season that a projection can exist for. The computer
	// points of the rating start with the seven divisions of 2013.
	firstPlayoffSeason = 2013
)

// PlayoffProjection gives the newest projection of a season, or nil when the season has none. The
// projection is read with one query for each table and put together here. The answer of a season
// is kept for playoffCacheTTL.
func (store *Postgres) PlayoffProjection(ctx context.Context, season *int) (*model.PlayoffProjection, error) {
	current, err := store.CurrentSeason(ctx)
	if err != nil {
		return nil, err
	}
	resolved := current
	if season != nil {
		resolved = *season
	}
	// A season that cannot have a projection gets no entry in the cache, so a caller cannot push
	// the real seasons out of it.
	if resolved < firstPlayoffSeason || resolved > current {
		return nil, nil
	}
	return store.playoffAnswers.get(resolved, func() (*model.PlayoffProjection, error) {
		loadContext, cancel := context.WithTimeout(context.WithoutCancel(ctx), playoffLoadTimeout)
		defer cancel()
		return store.loadPlayoffProjection(loadContext, resolved)
	})
}

func (store *Postgres) loadPlayoffProjection(ctx context.Context, season int) (*model.PlayoffProjection, error) {
	projection := model.PlayoffProjection{Season: season}
	var asOf time.Time
	err := store.client.QueryRow(ctx, playoffHeaderSQL, season).Scan(
		&asOf, &projection.Runs, &projection.Qualifiers, &projection.Byes, &projection.HomeGames,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("select playoff projection: %w", err)
	}
	projection.AsOf = asOf.Format(time.DateOnly)
	arguments := []any{season, asOf}

	outlooks, err := collect(ctx, store, "select playoff outlooks", playoffOutlooksSQL, arguments, scanOutlook)
	if err != nil {
		return nil, err
	}
	records, err := collect(ctx, store, "select playoff records", playoffRecordsSQL, arguments, scanRecord)
	if err != nil {
		return nil, err
	}
	keys := make([]string, 0)
	for _, outlook := range outlooks {
		keys = append(keys, outlook.gameKeys...)
	}
	games, err := collect(ctx, store, "select playoff games", playoffGamesSQL, []any{keys}, scanPlayoffGame)
	if err != nil {
		return nil, err
	}
	projection.Regions = assemblePlayoffs(outlooks, records, games)
	return &projection, nil
}

// outlookRow is one row of fct_playoff_outlooks with the facts of its team.
type outlookRow struct {
	outlook  *model.PlayoffOutlook
	region   int
	division int
	gameKeys []string
	// The odds of the team if it wins and if it loses each remaining game, in the order of
	// gameKeys.
	qualifyIfWin, qualifyIfLoss, homeIfWin, homeIfLoss []*float64
}

type recordRow struct {
	teamID string
	odds   *model.PlayoffRecordOdds
}

// gameRow is one game of fct_games, from the side of team A.
type gameRow struct {
	id                       string
	date                     string
	teamA, teamB             string
	nameA, nameB             string
	isTeamAHome, isTeamBHome bool
	teamAWinProbability      *float64
}

// assemblePlayoffs puts the rows of one projection together by region. The order of the queries
// gives the order of the regions, the teams and the records.
func assemblePlayoffs(outlooks []outlookRow, records []recordRow, games []gameRow) []*model.PlayoffRegion {
	gamesByKey := make(map[string]gameRow, len(games))
	for _, game := range games {
		gamesByKey[game.id] = game
	}
	byTeam := make(map[string]*model.PlayoffOutlook, len(outlooks))
	regions := make([]*model.PlayoffRegion, 0)
	byRegion := make(map[int]*model.PlayoffRegion)
	for _, row := range outlooks {
		byTeam[row.outlook.TeamID] = row.outlook
		region, found := byRegion[row.region]
		if !found {
			region = &model.PlayoffRegion{Region: row.region, Division: row.division, Teams: []*model.PlayoffOutlook{}}
			byRegion[row.region] = region
			regions = append(regions, region)
		}
		region.Teams = append(region.Teams, row.outlook)
		for index, key := range row.gameKeys {
			game := playoffGameFor(row.outlook.TeamID, key, gamesByKey)
			game.QualifyIfWin = at(row.qualifyIfWin, index)
			game.QualifyIfLoss = at(row.qualifyIfLoss, index)
			game.HomeIfWin = at(row.homeIfWin, index)
			game.HomeIfLoss = at(row.homeIfLoss, index)
			row.outlook.RemainingGames = append(row.outlook.RemainingGames, game)
		}
	}
	for _, row := range records {
		if team, found := byTeam[row.teamID]; found {
			// The runs play no ties, so a final record keeps the ties of the record so far.
			row.odds.Record.Ties = team.Record.Ties
			team.Records = append(team.Records, row.odds)
		}
	}
	return regions
}

// at gives the value at index, or nil when the list is shorter.
func at(values []*float64, index int) *float64 {
	if index < len(values) {
		return values[index]
	}
	return nil
}

// playoffGameFor gives a remaining game from the side of one team. A game that fct_games no longer
// holds keeps its place, because the lists of odds count the games in order.
func playoffGameFor(teamID, key string, games map[string]gameRow) *model.PlayoffGame {
	game, found := games[key]
	if !found {
		return &model.PlayoffGame{ID: key, OpponentName: "Unknown opponent", Location: model.GameLocationNeutral}
	}
	remaining := &model.PlayoffGame{ID: key, Date: game.date, Location: model.GameLocationNeutral}
	isTeamA := game.teamA == teamID
	if isTeamA {
		remaining.OpponentID, remaining.OpponentName = game.teamB, game.nameB
	} else {
		remaining.OpponentID, remaining.OpponentName = game.teamA, game.nameA
	}
	ownHome, otherHome := game.isTeamAHome, game.isTeamBHome
	if !isTeamA {
		ownHome, otherHome = otherHome, ownHome
	}
	switch {
	case ownHome:
		remaining.Location = model.GameLocationHome
	case otherHome:
		remaining.Location = model.GameLocationAway
	}
	if game.teamAWinProbability != nil {
		probability := *game.teamAWinProbability
		if !isTeamA {
			probability = 1 - probability
		}
		remaining.WinProbability = &probability
	}
	return remaining
}

func scanOutlook(row rowScanner) (outlookRow, error) {
	outlook := &model.PlayoffOutlook{
		Record:         &model.Record{},
		RemainingGames: []*model.PlayoffGame{},
		Records:        []*model.PlayoffRecordOdds{},
	}
	var result outlookRow
	var primary, secondary pgtype.Text
	var division pgtype.Int4
	var rating pgtype.Float8
	if err := row.Scan(
		&outlook.TeamID, &outlook.SourceID, &outlook.Name, &primary, &secondary, &division, &rating,
		&result.region, &outlook.Record.Wins, &outlook.Record.Losses, &outlook.Record.Ties,
		&outlook.LevelOne, &outlook.LevelTwo, &outlook.Divisor, &outlook.Average,
		&outlook.QualifyProbability, &outlook.HomeProbability, &outlook.ByeProbability,
		&outlook.RegionWinProbability, &outlook.ExpectedSeed,
		&result.gameKeys, &result.qualifyIfWin, &result.qualifyIfLoss, &result.homeIfWin, &result.homeIfLoss,
	); err != nil {
		return result, err
	}
	outlook.PrimaryColor = optional(primary.Valid, primary.String)
	outlook.SecondaryColor = optional(secondary.Valid, secondary.String)
	outlook.Rating = optional(rating.Valid, rating.Float64)
	result.division = int(division.Int32)
	result.outlook = outlook
	return result, nil
}

func scanRecord(row rowScanner) (recordRow, error) {
	odds := &model.PlayoffRecordOdds{Record: &model.Record{}}
	result := recordRow{odds: odds}
	err := row.Scan(
		&result.teamID, &odds.Record.Wins, &odds.Record.Losses, &odds.Probability, &odds.Runs,
		&odds.LowAverage, &odds.MedianAverage, &odds.HighAverage,
		&odds.QualifyProbability, &odds.HomeProbability, &odds.ByeProbability,
	)
	return result, err
}

func scanPlayoffGame(row rowScanner) (gameRow, error) {
	var result gameRow
	var day time.Time
	var probability pgtype.Float8
	if err := row.Scan(
		&result.id, &day, &result.teamA, &result.teamB, &result.nameA, &result.nameB,
		&result.isTeamAHome, &result.isTeamBHome, &probability,
	); err != nil {
		return result, err
	}
	result.date = day.Format(time.DateOnly)
	result.teamAWinProbability = optional(probability.Valid, probability.Float64)
	return result, nil
}

const playoffHeaderSQL = `
	SELECT as_of_date, runs, qualifiers, byes, home_games
	FROM ohfootball_marts.dim_playoff_projections
	WHERE season = $1
	ORDER BY as_of_date DESC
	LIMIT 1
`

// The rating is the relative rating of the newest snapshot of the season up to the as-of date of the
// projection, as on the leaderboard. The division of a region is the division of its teams, so one
// team without a division does not hide the region. The teams come in the order of their chance to
// qualify, then of their chance of a bye, both to the whole percent, then of their mean seed. The
// mean seed alone can place a team with a lower chance to qualify above the cut line, because the
// places of a team can split into two groups.
const playoffOutlooksSQL = `
	SELECT
		outlook.team_key::text,
		team.source_id,
		team.name,
		team.primary_color_hex,
		team.secondary_color_hex,
		MAX(team.division) OVER (PARTITION BY outlook.region),
		rating.relative_rating,
		outlook.region,
		outlook.wins,
		outlook.losses,
		outlook.ties,
		outlook.level_one,
		outlook.level_two,
		outlook.divisor,
		outlook.average,
		outlook.qualify_probability,
		outlook.home_probability,
		outlook.bye_probability,
		outlook.region_win_probability,
		outlook.expected_seed,
		outlook.remaining_game_keys::text[],
		outlook.qualify_if_win,
		outlook.qualify_if_loss,
		outlook.home_if_win,
		outlook.home_if_loss
	FROM ohfootball_marts.fct_playoff_outlooks AS outlook
	INNER JOIN ohfootball_marts.dim_teams AS team
		ON team.team_key = outlook.team_key
	   AND team.is_current
	LEFT JOIN LATERAL (
		SELECT relative_rating
		FROM ohfootball_marts.fct_team_ratings AS snapshot
		WHERE snapshot.team_key = outlook.team_key
		  AND snapshot.season = outlook.season
		  AND snapshot.as_of_date <= outlook.as_of_date
		ORDER BY snapshot.as_of_date DESC
		LIMIT 1
	) AS rating ON TRUE
	WHERE outlook.season = $1
	  AND outlook.as_of_date = $2
	ORDER BY
		outlook.region,
		ROUND(outlook.qualify_probability::numeric, 2) DESC,
		ROUND(outlook.bye_probability::numeric, 2) DESC,
		outlook.expected_seed,
		team.name
`

const playoffRecordsSQL = `
	SELECT
		team_key::text,
		wins,
		losses,
		probability,
		runs,
		low_average,
		median_average,
		high_average,
		qualify_probability,
		home_probability,
		bye_probability
	FROM ohfootball_marts.fct_playoff_record_odds
	WHERE season = $1
	  AND as_of_date = $2
	ORDER BY team_key, wins DESC
`

const playoffGamesSQL = `
	SELECT
		game.game_key::text,
		date.date_day,
		game.team_a_key::text,
		game.team_b_key::text,
		team_a.name,
		team_b.name,
		game.is_team_a_home,
		game.is_team_b_home,
		prediction.team_a_win_probability
	FROM ohfootball_marts.fct_games AS game
	INNER JOIN ohfootball_marts.dim_dates AS date
		ON date.date_key = game.game_date_key
	INNER JOIN ohfootball_marts.dim_teams AS team_a
		ON team_a.team_key = game.team_a_key
	   AND team_a.is_current
	INNER JOIN ohfootball_marts.dim_teams AS team_b
		ON team_b.team_key = game.team_b_key
	   AND team_b.is_current
	LEFT JOIN ohfootball_marts.fct_game_predictions AS prediction
		ON prediction.game_key = game.game_key
	WHERE game.is_current
	  AND game.game_key = ANY($1::uuid[])
`
