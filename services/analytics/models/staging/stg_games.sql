WITH source AS (
    SELECT * FROM {{ source('ohfootball_raw', 'games') }}
),

staged AS (
    SELECT
        id AS game_record_id,
        scrape_run_id,
        season,
        NULLIF(TRIM(source_team_id), '') AS source_team_id,
        CASE
            WHEN NULLIF(TRIM(game_date), '') ~ '^[0-9]{1,2}/[0-9]{1,2}$'
                THEN TO_DATE(CONCAT(season, '/', TRIM(game_date)), 'YYYY/MM/DD')
        END AS game_date,
        COALESCE(UPPER(NULLIF(TRIM(home_away), '')) = 'H', FALSE) AS is_source_team_home,
        COALESCE(UPPER(NULLIF(TRIM(home_away), '')) = 'A', FALSE) AS is_opponent_team_home,
        NULLIF(TRIM(opponent_team_id), '') AS opponent_team_id,
        CASE UPPER(NULLIF(TRIM(result), ''))
            WHEN 'W' THEN 'W'
            WHEN 'W*' THEN 'W'
            WHEN 'L' THEN 'L'
            WHEN 'L*' THEN 'L'
            WHEN 'T' THEN 'T'
            WHEN 'T*' THEN 'T'
            WHEN 'C' THEN 'C'
            WHEN 'C*' THEN 'C'
            ELSE 'unknown'
        END AS result,
        CASE
            WHEN UPPER(NULLIF(TRIM(result), '')) IN ('C', 'C*')
                THEN NULL
            WHEN LOWER(NULLIF(TRIM(notes), '')) = 'forfeit'
                THEN NULL
            WHEN NULLIF(TRIM(score), '') ~ '^[0-9]+-[0-9]+$'
                THEN SPLIT_PART(TRIM(score), '-', 1)::SMALLINT
        END AS source_team_score,
        CASE
            WHEN UPPER(NULLIF(TRIM(result), '')) IN ('C', 'C*')
                THEN NULL
            WHEN LOWER(NULLIF(TRIM(notes), '')) = 'forfeit'
                THEN NULL
            WHEN NULLIF(TRIM(score), '') ~ '^[0-9]+-[0-9]+$'
                THEN SPLIT_PART(TRIM(score), '-', 2)::SMALLINT
        END AS opponent_score,
        CASE LOWER(NULLIF(TRIM(notes), ''))
            WHEN 'ot' THEN 'overtime'
            WHEN 'cancel' THEN 'canceled'
            ELSE LOWER(NULLIF(TRIM(notes), ''))
        END AS notes,
        CASE NULLIF(TRIM(playoff), '')
            WHEN '#' THEN TRUE
            ELSE FALSE
        END AS is_playoff_game
    FROM source
)

SELECT * FROM staged
