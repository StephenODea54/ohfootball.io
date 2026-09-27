-- The scraper writes a placeholder row for a team whose page is empty. That
-- row must never become the current version of a team that a successful run
-- holds in full. Otherwise the team loses its attributes until the page comes
-- back.
WITH successful_runs AS (
    SELECT id AS scrape_run_id
    FROM {{ source('ohfootball_metadata', 'scrape_runs') }}
    WHERE LOWER(TRIM(status)) = 'succeeded'
),

full_teams AS (
    SELECT DISTINCT {{ team_key('teams.season', 'teams.team_id') }} AS team_key
    FROM {{ ref('stg_teams') }} AS teams
    INNER JOIN successful_runs USING (scrape_run_id)
    WHERE NOT {{ joeeitel_is_placeholder('teams') }}
)

SELECT teams.*
FROM {{ ref('dim_teams') }} AS teams
INNER JOIN full_teams USING (team_key)
WHERE teams.is_current
  AND {{ joeeitel_is_placeholder('teams') }}
