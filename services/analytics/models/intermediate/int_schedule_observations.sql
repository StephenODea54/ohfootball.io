-- One row for each schedule that a successful run read. The scraper writes the
-- game rows of a team only when it read the page of that team with its
-- schedule. The page of an opponent is read without its schedule, and an empty
-- page writes no game row, so neither is here. The backfill writes no row to
-- this source, so its runs read no schedule.
WITH successful_runs AS (
    SELECT
        id AS scrape_run_id,
        COALESCE(finished_at, started_at) AS observed_at
    FROM {{ source('ohfootball_metadata', 'scrape_runs') }}
    WHERE LOWER(TRIM(status)) = 'succeeded'
)

SELECT DISTINCT
    games.scrape_run_id,
    runs.observed_at,
    games.season,
    games.source_team_id AS team_id
FROM {{ ref('stg_games') }} AS games
INNER JOIN successful_runs AS runs USING (scrape_run_id)
WHERE games.source_team_id IS NOT NULL
