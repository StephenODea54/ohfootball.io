{{ config(
    indexes=[
        {'columns': ['game_version_key'], 'unique': true},
        {'columns': ['game_key']},
        {'columns': ['game_date_key']},
        {'columns': ['team_a_key']},
        {'columns': ['team_b_key']}
    ]
) }}

WITH ordered_observations AS (
    SELECT
        *,
        LAG(state_hash) OVER (
            PARTITION BY game_key
            ORDER BY observed_at, scrape_run_id
        ) AS previous_state_hash
    FROM {{ ref('int_games_canonicalized') }}
),

changes AS (
    SELECT *
    FROM ordered_observations
    WHERE
        previous_state_hash IS NULL
        OR state_hash IS DISTINCT FROM previous_state_hash
),

versioned AS (
    SELECT
        *,
        LEAD(observed_at) OVER (
            PARTITION BY game_key
            ORDER BY observed_at, scrape_run_id
        ) AS valid_to
    FROM changes
)

SELECT
    {{ ohfootball_uuid(
        "CONCAT('https://ohfootball.io/game-versions/', game_key, '/', scrape_run_id)"
    ) }} AS game_version_key,
    game_key,
    TO_CHAR(game_date, 'YYYYMMDD')::INTEGER AS game_date_key,
    {{ team_key('season', 'team_a_id') }} AS team_a_key,
    {{ team_key('season', 'team_b_id') }} AS team_b_key,
    season,
    team_a_score,
    team_b_score,
    team_a_result,
    CASE
        WHEN notes = 'double forfeit' THEN 'L'
        WHEN team_a_result = 'W' THEN 'L'
        WHEN team_a_result = 'L' THEN 'W'
        ELSE team_a_result
    END AS team_b_result,
    is_team_a_home,
    is_team_b_home,
    notes,
    is_playoff_game,
    observed_at AS valid_from,
    valid_to,
    valid_to IS NULL AS is_current
FROM versioned
