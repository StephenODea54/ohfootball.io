{{ config(
    indexes=[
        {'columns': ['team_version_key'], 'unique': true},
        {'columns': ['team_key']},
        {'columns': ['season', 'source_id']}
    ]
) }}

WITH ordered_observations AS (
    SELECT
        *,
        LAG(state_hash) OVER (
            PARTITION BY team_key
            ORDER BY observed_at, scrape_run_id
        ) AS previous_state_hash
    FROM {{ ref('int_team_observations') }}
),

changes AS (
    SELECT *
    FROM ordered_observations
    WHERE previous_state_hash IS NULL
       OR state_hash IS DISTINCT FROM previous_state_hash
),

versioned AS (
    SELECT
        *,
        LEAD(observed_at) OVER (
            PARTITION BY team_key
            ORDER BY observed_at, scrape_run_id
        ) AS valid_to
    FROM changes
)

SELECT
    {{ ohfootball_uuid("CONCAT('https://ohfootball.io/team-versions/', team_key, '/', scrape_run_id)") }} AS team_version_key,
    team_key,
    season,
    team_id AS source_id,
    name,
    mascot,
    city,
    state_code,
    county,
    primary_color_hex,
    secondary_color_hex,
    division,
    region,
    observed_at AS valid_from,
    valid_to,
    valid_to IS NULL AS is_current
FROM versioned
