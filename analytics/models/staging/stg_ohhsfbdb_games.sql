WITH source AS (
    SELECT * FROM {{ source('ohfootball_raw', 'ohhsfbdb_games') }}
),

staged AS (
    SELECT
        id AS game_record_id,
        scrape_run_id,
        NULLIF(TRIM(sheet), '') AS sheet,
        season,
        {{ ohhsfbdb_count('week') }} AS week,
        -- The site writes the date as M/D/YY. The season of the row supplies
        -- the year, because the site is kept by hand and a few rows carry a
        -- year that is a slip of the keyboard.
        CASE
            WHEN NULLIF(TRIM(game_date), '') ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2}$'
            THEN TO_DATE(
                CONCAT(
                    season, '/',
                    SPLIT_PART(TRIM(game_date), '/', 1), '/',
                    SPLIT_PART(TRIM(game_date), '/', 2)
                ),
                'YYYY/MM/DD'
            )
        END AS game_date,
        -- H, A, and N. A game on neither ground leaves both flags false, which
        -- is how the other source records the same thing.
        COALESCE(UPPER(NULLIF(TRIM(home_away), '')) = 'H', FALSE) AS is_source_team_home,
        COALESCE(UPPER(NULLIF(TRIM(home_away), '')) = 'A', FALSE) AS is_opponent_team_home,
        NULLIF(TRIM(opponent_name), '') AS opponent_name,
        NULLIF(TRIM(opponent_sheet), '') AS opponent_sheet,
        {{ ohhsfbdb_count('team_score') }} AS source_team_score,
        {{ ohhsfbdb_count('opponent_score') }} AS opponent_score,
        CASE UPPER(NULLIF(TRIM(result), ''))
            WHEN 'W' THEN 'W'
            WHEN 'L' THEN 'L'
            WHEN 'T' THEN 'T'
            ELSE 'unknown'
        END AS result,
        CASE
            WHEN NULLIF(TRIM(overtime), '') IS NOT NULL THEN 'overtime'
        END AS notes,
        NULLIF(TRIM(playoff_round), '') IS NOT NULL AS is_playoff_game,
        NULLIF(TRIM(playoff_round), '') AS playoff_round,
        NULLIF(TRIM(opponent_conference), '') AS opponent_conference,
        NULLIF(TRIM(opponent_division), '') AS opponent_division,
        NULLIF(TRIM(opponent_region), '') AS opponent_region,
        NULLIF(TRIM(stadium), '') AS stadium,
        NULLIF(TRIM(location), '') AS location
    FROM source
)

SELECT * FROM staged
