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
),

-- A placeholder holds no attributes of the team. If a successful run holds the
-- team in full, the placeholder is dropped, so the full version stays current
-- while the page of the team is empty. A team that only has placeholders keeps
-- them.
full_teams AS (
    SELECT DISTINCT team_key
    FROM observations
    WHERE NOT {{ joeeitel_is_placeholder('observations') }}
),

kept_observations AS (
    SELECT observations.*
    FROM observations
    WHERE
        NOT {{ joeeitel_is_placeholder('observations') }}
        OR NOT EXISTS (
            SELECT 1
            FROM full_teams
            WHERE full_teams.team_key = observations.team_key
        )
)

-- The two sites cover different seasons, so no team and season pair comes from
-- both.
SELECT * FROM kept_observations

UNION ALL

SELECT * FROM {{ ref('int_ohhsfbdb_team_observations') }}
