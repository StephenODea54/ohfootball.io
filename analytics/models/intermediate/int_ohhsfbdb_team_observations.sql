-- The set of team and season pairs comes from the games that resolved, on both
-- sides. Building it from the sheets alone would miss the schools that have no
-- sheet, such as an opponent from another state, and every game names two
-- teams that the fact table then expects to find here.
--
-- The columns match int_team_observations, because the two feed one dimension.
-- The site names no mascot, city, county, or colour, so those are empty.

WITH latest_run AS (
    SELECT id AS scrape_run_id FROM {{ ohhsfbdb_latest_run() }} AS run(id)
),

run_observed_at AS (
    SELECT COALESCE(finished_at, started_at) AS observed_at
    FROM {{ source('ohfootball_metadata', 'scrape_runs') }}
    WHERE id = (SELECT scrape_run_id FROM latest_run)
),

games AS (
    SELECT *
    FROM {{ ref('int_ohhsfbdb_games') }}
    WHERE NOT is_opponent_unresolved
),

-- Both sides of every game that resolved.
appearances AS (
    SELECT season, source_team_id AS team_id, sheet, NULL::TEXT AS opponent_division, NULL::TEXT AS opponent_region
    FROM games
    UNION ALL
    SELECT season, opponent_team_id AS team_id, NULL AS sheet, opponent_division, opponent_region
    FROM games
),

team_seasons AS (
    SELECT
        season,
        team_id,
        MIN(sheet) AS sheet,
        MIN(opponent_division) AS division_from_a_game,
        MIN(opponent_region) AS region_from_a_game
    FROM appearances
    GROUP BY season, team_id
),

-- The season block of a sheet states the conference, the division, the region,
-- and the rank of the school that owns the sheet.
summaries AS (
    SELECT sheet, season, division, region, conference
    FROM {{ ref('stg_ohhsfbdb_season_summaries') }}
    WHERE scrape_run_id = (SELECT scrape_run_id FROM latest_run)
),

-- A school with no sheet takes the name the other school wrote for it.
names_from_games AS (
    SELECT opponent_team_id AS team_id, MIN(opponent_name) AS name
    FROM games
    WHERE opponent_name IS NOT NULL
    GROUP BY opponent_team_id
),

observations AS (
    SELECT
        {{ team_key('team_seasons.season', 'team_seasons.team_id') }} AS team_key,
        (SELECT scrape_run_id FROM latest_run) AS scrape_run_id,
        (SELECT observed_at FROM run_observed_at) AS observed_at,
        team_seasons.season,
        team_seasons.team_id,
        COALESCE(sheet_teams.name, names_from_games.name) AS name,
        NULL::TEXT AS mascot,
        NULL::TEXT AS city,
        -- The site holds the football of Ohio, so every school with a sheet is
        -- a school of Ohio. A school from anywhere else has no sheet, and the
        -- site writes its state or province inside its name.
        CASE
            WHEN team_seasons.sheet IS NOT NULL THEN 'OH'
            ELSE {{ ohhsfbdb_state_in_name('COALESCE(sheet_teams.name, names_from_games.name)') }}
        END AS state_code,
        NULL::TEXT AS county,
        NULL::TEXT AS primary_color_hex,
        NULL::TEXT AS secondary_color_hex,
        -- The other source types both as whole numbers, and this site writes
        -- them as digits, so the two agree once the text is cast.
        CASE
            WHEN COALESCE(summaries.division, team_seasons.division_from_a_game) ~ '^[0-9]+$'
            THEN COALESCE(summaries.division, team_seasons.division_from_a_game)::SMALLINT
        END AS division,
        CASE
            WHEN COALESCE(summaries.region, team_seasons.region_from_a_game) ~ '^[0-9]+$'
            THEN COALESCE(summaries.region, team_seasons.region_from_a_game)::SMALLINT
        END AS region
    FROM team_seasons
    LEFT JOIN {{ ref('int_ohhsfbdb_sheet_teams') }} AS sheet_teams
        ON sheet_teams.sheet = team_seasons.sheet
    LEFT JOIN summaries
        ON summaries.sheet = team_seasons.sheet
       AND summaries.season = team_seasons.season
    LEFT JOIN names_from_games
        ON names_from_games.team_id = team_seasons.team_id
)

SELECT
    *,
    MD5(JSONB_BUILD_ARRAY(
        name,
        mascot,
        city,
        state_code,
        county,
        primary_color_hex,
        secondary_color_hex,
        division,
        region
    )::TEXT) AS state_hash
FROM observations
