WITH successful_runs AS (
    SELECT
        id AS scrape_run_id,
        COALESCE(finished_at, started_at) AS observed_at
    FROM {{ source('ohfootball_metadata', 'scrape_runs') }}
    WHERE LOWER(TRIM(status)) = 'succeeded'
),

observations AS (
    SELECT
        {{ team_key('teams.season', 'teams.team_id') }} AS team_key,
        teams.scrape_run_id,
        runs.observed_at,
        teams.season,
        teams.team_id,
        teams.name,
        teams.mascot,
        teams.city,
        teams.state_code,
        teams.county,
        teams.primary_color_hex,
        teams.secondary_color_hex,
        teams.division,
        teams.region,
        MD5(JSONB_BUILD_ARRAY(
            teams.name,
            teams.mascot,
            teams.city,
            teams.state_code,
            teams.county,
            teams.primary_color_hex,
            teams.secondary_color_hex,
            teams.division,
            teams.region
        )::TEXT) AS state_hash
    FROM {{ ref('stg_teams') }} AS teams
    INNER JOIN successful_runs AS runs USING (scrape_run_id)
)

SELECT * FROM observations
