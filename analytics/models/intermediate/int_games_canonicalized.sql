WITH successful_runs AS (
    SELECT
        id AS scrape_run_id,
        COALESCE(finished_at, started_at) AS observed_at
    FROM {{ source('ohfootball_metadata', 'scrape_runs') }}
    WHERE LOWER(TRIM(status)) = 'succeeded'
),

games AS (
    SELECT
        games.*,
        runs.observed_at,
        LEAST(source_team_id, opponent_team_id) AS team_a_id,
        GREATEST(source_team_id, opponent_team_id) AS team_b_id
    FROM {{ ref('stg_games') }} AS games
    INNER JOIN successful_runs AS runs USING (scrape_run_id)
),

perspectives AS (
    SELECT
        scrape_run_id,
        observed_at,
        season,
        game_date,
        team_a_id,
        team_b_id,
        source_team_id,
        CASE
            WHEN source_team_id = team_a_id THEN source_team_score
            ELSE opponent_score
        END AS team_a_score,
        CASE
            WHEN source_team_id = team_b_id THEN source_team_score
            ELSE opponent_score
        END AS team_b_score,
        CASE
            WHEN source_team_id = team_a_id THEN result
            WHEN result = 'W' THEN 'L'
            WHEN result = 'L' THEN 'W'
            ELSE result
        END AS team_a_result,
        CASE
            WHEN source_team_id = team_a_id THEN is_source_team_home
            ELSE is_opponent_team_home
        END AS is_team_a_home,
        CASE
            WHEN source_team_id = team_b_id THEN is_source_team_home
            ELSE is_opponent_team_home
        END AS is_team_b_home,
        notes,
        is_playoff_game
    FROM games
),

canonicalized AS (
    SELECT
        {{ game_key('season', 'game_date', 'team_a_id', 'team_b_id') }} AS game_key,
        scrape_run_id,
        observed_at,
        season,
        game_date,
        team_a_id,
        team_b_id,
        MIN(team_a_score) AS team_a_score,
        MIN(team_b_score) AS team_b_score,
        MIN(team_a_result) AS team_a_result,
        BOOL_OR(is_team_a_home) AS is_team_a_home,
        BOOL_OR(is_team_b_home) AS is_team_b_home,
        NOT BOOL_OR(is_team_a_home) AND NOT BOOL_OR(is_team_b_home) AS is_neutral_site,
        MAX(notes) AS notes,
        BOOL_OR(is_playoff_game) AS is_playoff_game,
        COUNT(*) AS source_record_count,
        COUNT(DISTINCT source_team_id) AS source_perspective_count,
        COUNT(DISTINCT source_team_id) = 2 AS has_both_team_perspectives,
        (
            COUNT(DISTINCT team_a_score) FILTER (WHERE team_a_score IS NOT NULL) > 1
            OR COUNT(DISTINCT team_b_score) FILTER (WHERE team_b_score IS NOT NULL) > 1
            OR COUNT(DISTINCT team_a_result) > 1
            OR COUNT(DISTINCT is_team_a_home) > 1
            OR COUNT(DISTINCT is_team_b_home) > 1
            OR COUNT(DISTINCT notes) FILTER (WHERE notes IS NOT NULL) > 1
            OR COUNT(DISTINCT is_playoff_game) > 1
        ) AS has_conflicting_perspectives
    FROM perspectives
    GROUP BY
        scrape_run_id,
        observed_at,
        season,
        game_date,
        team_a_id,
        team_b_id
),

with_state AS (
    SELECT
        *,
        MD5(JSONB_BUILD_ARRAY(
            team_a_score,
            team_b_score,
            team_a_result,
            is_team_a_home,
            is_team_b_home,
            notes,
            is_playoff_game
        )::TEXT) AS state_hash
    FROM canonicalized
)

SELECT * FROM with_state
