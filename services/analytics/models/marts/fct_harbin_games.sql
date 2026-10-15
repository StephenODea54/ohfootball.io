{{ config(
    indexes=[
        {'columns': ['game_key'], 'unique': true},
        {'columns': ['season']}
    ]
) }}

-- The games that the OHSAA computer points of a season read.
--
-- The games of the Ohio teams are the current games of fct_games, so the points read the same
-- games as the rating. Each one carries the mark of a game that the OHSAA leaves out of its
-- points, from the newest run that listed it. The points also count the wins and the games of
-- each opponent from another state, so the games between two teams from other states come from
-- the schedules of those opponents, in the newest run of the season that read them.

WITH successful_runs AS (
    SELECT
        id AS scrape_run_id,
        COALESCE(finished_at, started_at) AS observed_at
    FROM {{ source('ohfootball_metadata', 'scrape_runs') }}
    WHERE
        LOWER(TRIM(status)) = 'succeeded'
        AND scraper_version LIKE 'joe-eitel@%'
),

ohio_teams AS (
    SELECT
        season,
        source_id
    FROM {{ ref('dim_teams') }}
    WHERE
        is_current
        AND state_code = 'OH'
),

-- The newest mark of each game. A game counts unless a schedule of the newest run that listed it
-- marks it.
marks AS (
    SELECT
        game_key,
        BOOL_AND(counts_in_ohsaa_rating) AS counts_in_ohsaa_rating
    FROM (
        SELECT
            {{ game_key(
                'games.season',
                'games.game_date',
                'LEAST(games.source_team_id, games.opponent_team_id)',
                'GREATEST(games.source_team_id, games.opponent_team_id)'
            ) }} AS game_key,
            games.counts_in_ohsaa_rating,
            RANK() OVER (
                PARTITION BY
                    games.season,
                    games.game_date,
                    LEAST(games.source_team_id, games.opponent_team_id),
                    GREATEST(games.source_team_id, games.opponent_team_id)
                ORDER BY runs.observed_at DESC, runs.scrape_run_id DESC
            ) AS recency
        FROM {{ ref('stg_games') }} AS games
        INNER JOIN successful_runs AS runs USING (scrape_run_id)
        WHERE games.opponent_team_id IS NOT NULL
    ) AS listed
    WHERE recency = 1
    GROUP BY game_key
),

ohio_games AS (
    SELECT
        games.game_key,
        games.season,
        dates.date_day AS game_date,
        games.team_a_key,
        games.team_b_key,
        team_a.source_id AS team_a_source_id,
        team_b.source_id AS team_b_source_id,
        games.team_a_result,
        games.team_b_result,
        games.is_team_a_home,
        games.is_team_b_home,
        games.is_playoff_game,
        COALESCE(marks.counts_in_ohsaa_rating, TRUE) AS counts_in_ohsaa_rating
    FROM {{ ref('fct_games') }} AS games
    INNER JOIN {{ ref('dim_dates') }} AS dates
        ON games.game_date_key = dates.date_key
    INNER JOIN {{ ref('dim_teams') }} AS team_a
        ON
            games.team_a_key = team_a.team_key
            AND team_a.is_current
    INNER JOIN {{ ref('dim_teams') }} AS team_b
        ON
            games.team_b_key = team_b.team_key
            AND team_b.is_current
    LEFT JOIN marks USING (game_key)
    -- The OHSAA has had seven divisions since 2013, and the points of this model start there.
    WHERE
        games.is_current
        AND games.season >= 2013
),

opponent_runs AS (
    SELECT
        season,
        scrape_run_id
    FROM (
        SELECT
            games.season,
            games.scrape_run_id,
            ROW_NUMBER() OVER (
                PARTITION BY games.season
                ORDER BY runs.observed_at DESC, games.scrape_run_id DESC
            ) AS position
        FROM (
            SELECT DISTINCT
                season,
                scrape_run_id
            FROM {{ ref('stg_opponent_games') }}
        ) AS games
        INNER JOIN successful_runs AS runs USING (scrape_run_id)
    ) AS ranked
    WHERE position = 1
),

opponent_rows AS (
    SELECT opponent_games.*
    FROM {{ ref('stg_opponent_games') }} AS opponent_games
    INNER JOIN opponent_runs USING (season, scrape_run_id)
),

-- The teams from other states whose page the newest run read, so their whole schedule is here.
opponent_pages AS (
    SELECT DISTINCT
        season,
        source_team_id
    FROM opponent_rows
),

-- A game of an opponent against an Ohio team is in fct_games already. A row without an opponent
-- identifier names no team, so it cannot be one game.
other_perspectives AS (
    SELECT
        opponent_rows.season,
        opponent_rows.game_date,
        LEAST(opponent_rows.source_team_id, opponent_rows.opponent_team_id) AS team_a_id,
        GREATEST(opponent_rows.source_team_id, opponent_rows.opponent_team_id) AS team_b_id,
        CASE
            WHEN opponent_rows.notes = 'double forfeit' THEN 'L'
            WHEN opponent_rows.source_team_id < opponent_rows.opponent_team_id
                THEN opponent_rows.result
            WHEN opponent_rows.result = 'W' THEN 'L'
            WHEN opponent_rows.result = 'L' THEN 'W'
            ELSE opponent_rows.result
        END AS team_a_result,
        opponent_rows.notes = 'double forfeit' AS is_double_forfeit,
        CASE
            WHEN opponent_rows.source_team_id < opponent_rows.opponent_team_id
                THEN opponent_rows.is_source_team_home
            ELSE opponent_rows.is_opponent_team_home
        END AS is_team_a_home,
        CASE
            WHEN opponent_rows.source_team_id < opponent_rows.opponent_team_id
                THEN opponent_rows.is_opponent_team_home
            ELSE opponent_rows.is_source_team_home
        END AS is_team_b_home,
        opponent_rows.is_playoff_game,
        opponent_rows.counts_in_ohsaa_rating
    FROM opponent_rows
    LEFT JOIN ohio_teams AS source_team
        ON
            opponent_rows.season = source_team.season
            AND opponent_rows.source_team_id = source_team.source_id
    LEFT JOIN ohio_teams AS opponent_team
        ON
            opponent_rows.season = opponent_team.season
            AND opponent_rows.opponent_team_id = opponent_team.source_id
    WHERE
        opponent_rows.opponent_team_id IS NOT NULL
        AND opponent_rows.game_date IS NOT NULL
        AND source_team.source_id IS NULL
        AND opponent_team.source_id IS NULL
),

other_games AS (
    SELECT
        {{ game_key('season', 'game_date', 'team_a_id', 'team_b_id') }} AS game_key,
        season,
        game_date,
        {{ team_key('season', 'team_a_id') }} AS team_a_key,
        {{ team_key('season', 'team_b_id') }} AS team_b_key,
        team_a_id AS team_a_source_id,
        team_b_id AS team_b_source_id,
        MIN(team_a_result) AS team_a_result,
        BOOL_OR(is_team_a_home) AS is_team_a_home,
        BOOL_OR(is_team_b_home) AS is_team_b_home,
        BOOL_OR(is_playoff_game) AS is_playoff_game,
        BOOL_AND(counts_in_ohsaa_rating) AS counts_in_ohsaa_rating,
        COALESCE(BOOL_OR(is_double_forfeit), FALSE) AS is_double_forfeit
    FROM other_perspectives
    GROUP BY
        season,
        game_date,
        team_a_id,
        team_b_id
),

all_games AS (
    SELECT * FROM ohio_games

    UNION ALL

    SELECT
        game_key,
        season,
        game_date,
        team_a_key,
        team_b_key,
        team_a_source_id,
        team_b_source_id,
        team_a_result,
        CASE
            WHEN is_double_forfeit THEN 'L'
            WHEN team_a_result = 'W' THEN 'L'
            WHEN team_a_result = 'L' THEN 'W'
            ELSE team_a_result
        END AS team_b_result,
        is_team_a_home,
        is_team_b_home,
        is_playoff_game,
        counts_in_ohsaa_rating
    FROM other_games
)

SELECT
    games.game_key,
    games.season,
    games.game_date,
    games.team_a_key,
    games.team_b_key,
    games.team_a_result,
    -- Both results, because a double forfeit is a loss for both teams.
    games.team_b_result,
    games.is_team_a_home,
    games.is_team_b_home,
    games.is_playoff_game,
    games.counts_in_ohsaa_rating,
    -- True when the whole schedule of the team is here: an Ohio team, or a team from another
    -- state whose page the newest run read.
    (ohio_a.source_id IS NOT NULL OR pages_a.source_team_id IS NOT NULL) AS has_team_a_schedule,
    (ohio_b.source_id IS NOT NULL OR pages_b.source_team_id IS NOT NULL) AS has_team_b_schedule
FROM all_games AS games
LEFT JOIN ohio_teams AS ohio_a
    ON
        games.season = ohio_a.season
        AND games.team_a_source_id = ohio_a.source_id
LEFT JOIN ohio_teams AS ohio_b
    ON
        games.season = ohio_b.season
        AND games.team_b_source_id = ohio_b.source_id
LEFT JOIN opponent_pages AS pages_a
    ON
        games.season = pages_a.season
        AND games.team_a_source_id = pages_a.source_team_id
LEFT JOIN opponent_pages AS pages_b
    ON
        games.season = pages_b.season
        AND games.team_b_source_id = pages_b.source_team_id
