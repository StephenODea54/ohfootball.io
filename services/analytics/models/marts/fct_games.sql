{{ config(
    indexes=[
        {'columns': ['game_version_key'], 'unique': true},
        {'columns': ['game_key']},
        {'columns': ['game_date_key']},
        {'columns': ['team_a_key']},
        {'columns': ['team_b_key']}
    ]
) }}

WITH observations AS (
    SELECT
        *,
        LEAD(observed_at) OVER runs AS next_observed_at,
        LEAD(scrape_run_id) OVER runs AS next_scrape_run_id
    FROM {{ ref('int_games_canonicalized') }}
    WINDOW runs AS (PARTITION BY game_key ORDER BY observed_at, scrape_run_id)
),

-- Each team that listed the game in an observation. A team that did not list
-- the game says nothing about it later, so its schedule cannot remove it.
listings AS (
    SELECT
        game_key,
        scrape_run_id,
        observed_at,
        next_observed_at,
        next_scrape_run_id,
        season,
        team_a_id AS team_id
    FROM observations
    WHERE is_listed_by_team_a

    UNION ALL

    SELECT
        game_key,
        scrape_run_id,
        observed_at,
        next_observed_at,
        next_scrape_run_id,
        season,
        team_b_id AS team_id
    FROM observations
    WHERE is_listed_by_team_b
),

-- The first later run that read the schedule of a team that listed the game,
-- before the game was seen again. That run did not list the game, or it would
-- be the next observation. The run must end strictly later, so a version never
-- ends at the moment it starts.
removals AS (
    SELECT
        listings.game_key,
        listings.scrape_run_id,
        MIN(schedules.observed_at) AS removed_at
    FROM listings
    INNER JOIN {{ ref('int_schedule_observations') }} AS schedules
        ON
            listings.season = schedules.season
            AND listings.team_id = schedules.team_id
            AND listings.observed_at < schedules.observed_at
            AND (
                listings.next_observed_at IS NULL
                OR (schedules.observed_at, schedules.scrape_run_id)
                < (listings.next_observed_at, listings.next_scrape_run_id)
            )
    GROUP BY listings.game_key, listings.scrape_run_id
),

ordered_observations AS (
    SELECT
        observations.*,
        removals.removed_at,
        LAG(observations.state_hash) OVER runs AS previous_state_hash,
        LAG(removals.removed_at) OVER runs AS previous_removed_at
    FROM observations
    LEFT JOIN removals USING (game_key, scrape_run_id)
    WINDOW runs AS (PARTITION BY game_key ORDER BY observed_at, scrape_run_id)
),

-- A version starts at the first observation of a game, when its state changes,
-- and when the game is seen again after it was gone.
numbered AS (
    SELECT
        *,
        SUM(
            CASE
                WHEN
                    previous_state_hash IS NULL
                    OR state_hash IS DISTINCT FROM previous_state_hash
                    OR previous_removed_at IS NOT NULL
                    THEN 1
                ELSE 0
            END
        ) OVER (
            PARTITION BY game_key
            ORDER BY observed_at, scrape_run_id
            ROWS UNBOUNDED PRECEDING
        ) AS version_number
    FROM ordered_observations
),

-- Only the last observation of a version can be followed by a removal, because
-- the observation after a removal starts a new version.
versions AS (
    SELECT
        *,
        MAX(removed_at) OVER version_rows AS version_removed_at,
        ROW_NUMBER() OVER (version_rows ORDER BY observed_at, scrape_run_id) AS position_in_version
    FROM numbered
    WINDOW version_rows AS (PARTITION BY game_key, version_number)
),

versioned AS (
    SELECT
        *,
        COALESCE(
            version_removed_at,
            LEAD(observed_at) OVER (
                PARTITION BY game_key
                ORDER BY observed_at, scrape_run_id
            )
        ) AS valid_to
    FROM versions
    WHERE position_in_version = 1
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
