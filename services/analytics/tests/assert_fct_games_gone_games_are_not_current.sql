-- A current game must still be listed by each team that listed it, in every
-- later successful run that read the schedule of that team.
WITH latest_observations AS (
    SELECT DISTINCT ON (game_key)
        game_key,
        scrape_run_id,
        observed_at,
        season,
        team_a_id,
        team_b_id,
        is_listed_by_team_a,
        is_listed_by_team_b
    FROM {{ ref('int_games_canonicalized') }}
    ORDER BY game_key ASC, observed_at DESC, scrape_run_id DESC
),

current_listings AS (
    SELECT
        latest.game_key,
        latest.observed_at,
        latest.season,
        latest.team_a_id AS team_id
    FROM latest_observations AS latest
    INNER JOIN {{ ref('fct_games') }} AS games
        ON latest.game_key = games.game_key AND games.is_current
    WHERE latest.is_listed_by_team_a

    UNION ALL

    SELECT
        latest.game_key,
        latest.observed_at,
        latest.season,
        latest.team_b_id AS team_id
    FROM latest_observations AS latest
    INNER JOIN {{ ref('fct_games') }} AS games
        ON latest.game_key = games.game_key AND games.is_current
    WHERE latest.is_listed_by_team_b
)

SELECT
    listings.game_key,
    schedules.scrape_run_id,
    schedules.team_id
FROM current_listings AS listings
INNER JOIN {{ ref('int_schedule_observations') }} AS schedules
    ON
        listings.season = schedules.season
        AND listings.team_id = schedules.team_id
        AND listings.observed_at < schedules.observed_at
