package store

import "strconv"

// The week of the season. Every query that groups the games of a season by week reads the rule
// from here, so a week number means the same thing in each answer of the API.
//
// Weeks run from Wednesday to Tuesday. Games are played from Thursday to Saturday, so a game on
// the Wednesday before goes with the games of that Friday, and so does a makeup game on the Monday
// or the Tuesday after. DATE_TRUNC('week') gives the Monday of a date, so the date is moved back
// two days first. The week then starts two days after that Monday, on the Wednesday.
//
// Week 1 is the first week of the season that holds at least seasonStartOhioGames games between
// two Ohio teams. Every game counts, whatever its result, so a season whose games are not played
// yet has a week 1 too. A few out-of-state games before that week do not move the start of the
// season. Such a game goes into week 1. A season with no week of that size starts at the week of
// its first game. Week N is the week N-1 weeks after week 1, and a week counts even when it holds
// no game, so the numbers never shift.
//
// Each fragment reads the date of a game as date.date_day.

const (
	// weekStartDaysBack is the number of days that a date moves back before DATE_TRUNC('week'),
	// so that the week starts on a Wednesday.
	weekStartDaysBack = 2
	// seasonStartOhioGames is the fewest games between two Ohio teams that week 1 holds.
	seasonStartOhioGames = 50
	// firstWeek is the number of the first week. A game before it is in it.
	firstWeek = 1
)

// weekStartSQL is the Monday before the Wednesday that starts the week of date.date_day.
var weekStartSQL = `DATE_TRUNC('week', date.date_day - ` + strconv.Itoa(weekStartDaysBack) + `)::date`

// seasonStartsCTE is a part of a WITH clause. It gives the week start of week 1 of each season.
var seasonStartsCTE = `
	season_weeks AS (
		SELECT
			game.season,
			` + weekStartSQL + ` AS week_start,
			COUNT(*) FILTER (
				WHERE team_a.state_code = 'OH' AND team_b.state_code = 'OH'
			) AS ohio_games
		FROM ohfootball_marts.fct_games AS game
		INNER JOIN ohfootball_marts.dim_dates AS date
			ON date.date_key = game.game_date_key
		LEFT JOIN ohfootball_marts.dim_teams AS team_a
			ON team_a.team_key = game.team_a_key AND team_a.is_current
		LEFT JOIN ohfootball_marts.dim_teams AS team_b
			ON team_b.team_key = game.team_b_key AND team_b.is_current
		WHERE game.is_current
		GROUP BY game.season, week_start
	),
	season_starts AS (
		SELECT
			season,
			COALESCE(
				MIN(week_start) FILTER (WHERE ohio_games >= ` + strconv.Itoa(seasonStartOhioGames) + `),
				MIN(week_start)
			) AS week_start
		FROM season_weeks
		GROUP BY season
	)`

// weekNumberSQL is the week of date.date_day in its season. The query must join season_starts
// on the season of the game.
var weekNumberSQL = `GREATEST(` + strconv.Itoa(firstWeek) + `, (` + weekStartSQL +
	` - season_starts.week_start) / 7 + 1)::int`
