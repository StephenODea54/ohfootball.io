-- The shape matches int_games_canonicalized, because the two feed one fact
-- table. Only the games whose opponent resolved take part. A game whose
-- opponent did not resolve stays in int_ohhsfbdb_games with its flag, and it is
-- counted by a test rather than dropped in silence.

-- A sheet sometimes lists one game twice, with every field the same. Such a row
-- is a repeat, not a second game, so it counts once.
WITH games AS (
    SELECT DISTINCT
        scrape_run_id,
        sheet,
        source_team_id,
        opponent_team_id,
        season,
        game_date,
        is_source_team_home,
        is_opponent_team_home,
        source_team_score,
        opponent_score,
        result,
        notes,
        is_playoff_game
    FROM {{ ref('int_ohhsfbdb_games') }}
    WHERE
        NOT is_opponent_unresolved
        AND game_date IS NOT NULL
        AND source_team_id <> opponent_team_id
),

run_observed_at AS (
    SELECT COALESCE(finished_at, started_at) AS observed_at
    FROM {{ source('ohfootball_metadata', 'scrape_runs') }}
    WHERE id = {{ ohhsfbdb_latest_run() }}
),

sided AS (
    SELECT
        games.*,
        (SELECT observed_at FROM run_observed_at) AS observed_at,
        LEAST(source_team_id, opponent_team_id) AS team_a_id,
        GREATEST(source_team_id, opponent_team_id) AS team_b_id
    FROM games
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
        CASE WHEN source_team_id = team_a_id THEN source_team_score ELSE opponent_score END
            AS team_a_score,
        CASE WHEN source_team_id = team_b_id THEN source_team_score ELSE opponent_score END
            AS team_b_score,
        -- The scores decide the result when the sheet holds both, because the
        -- site is kept by hand and a few rows record a letter that the scores
        -- contradict. The letter stands only when a score is missing.
        CASE
            WHEN source_team_score IS NOT NULL AND opponent_score IS NOT NULL
                THEN
                    CASE
                        WHEN
                            source_team_id = team_a_id AND source_team_score > opponent_score
                            THEN 'W'
                        WHEN
                            source_team_id = team_a_id AND source_team_score < opponent_score
                            THEN 'L'
                        WHEN
                            source_team_id = team_b_id AND source_team_score > opponent_score
                            THEN 'L'
                        WHEN
                            source_team_id = team_b_id AND source_team_score < opponent_score
                            THEN 'W'
                        ELSE 'T'
                    END
            WHEN source_team_id = team_a_id THEN result
            WHEN result = 'W' THEN 'L'
            WHEN result = 'L' THEN 'W'
            ELSE result
        END AS team_a_result,
        CASE
            WHEN source_team_id = team_a_id THEN is_source_team_home ELSE is_opponent_team_home
        END AS is_team_a_home,
        CASE
            WHEN source_team_id = team_b_id THEN is_source_team_home ELSE is_opponent_team_home
        END AS is_team_b_home,
        result AS source_result,
        notes,
        is_playoff_game
    FROM sided
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
        -- Both schools record a loss and neither records a score when a game
        -- was forfeited by both. The other source states the same thing with a
        -- note, and the fact table keeps one convention for it.
        CASE
            WHEN
                COUNT(*) FILTER (WHERE source_result = 'L') = COUNT(*)
                AND COUNT(team_a_score) = 0
                AND COUNT(team_b_score) = 0
                THEN 'L'
            ELSE MIN(team_a_result)
        END AS team_a_result,
        -- Both schools claim the ground on one game of the whole backfill.
        -- Neither claim can be believed over the other, so the game keeps no
        -- ground at all.
        BOOL_OR(is_team_a_home) AND NOT BOOL_OR(is_team_b_home) AS is_team_a_home,
        BOOL_OR(is_team_b_home) AND NOT BOOL_OR(is_team_a_home) AS is_team_b_home,
        NOT BOOL_OR(is_team_a_home) AND NOT BOOL_OR(is_team_b_home) AS is_neutral_site,
        MAX(notes) AS notes,
        BOOL_OR(is_playoff_game) AS is_playoff_game,
        COUNT(*) AS source_record_count,
        COUNT(DISTINCT source_team_id) AS source_perspective_count,
        COUNT(DISTINCT source_team_id) = 2 AS has_both_team_perspectives,
        (
            COUNT(DISTINCT team_a_score) FILTER (WHERE team_a_score IS NOT NULL) > 1
            OR COUNT(DISTINCT team_b_score) FILTER (WHERE team_b_score IS NOT NULL) > 1
            OR (
                COUNT(DISTINCT team_a_result) > 1
                AND NOT (
                    COUNT(*) FILTER (WHERE source_result = 'L') = COUNT(*)
                    AND COUNT(team_a_score) = 0
                    AND COUNT(team_b_score) = 0
                )
            )
        ) AS has_conflicting_perspectives
    FROM perspectives
    GROUP BY
        scrape_run_id,
        observed_at,
        season,
        game_date,
        team_a_id,
        team_b_id
)

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
