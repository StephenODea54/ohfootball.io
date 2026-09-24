WITH source AS (
    SELECT * FROM {{ source('ohfootball_raw', 'ohhsfbdb_teams') }}
),

staged AS (
    SELECT
        id AS team_record_id,
        scrape_run_id,
        NULLIF(TRIM(sheet), '') AS sheet,
        -- The identifier that joeeitel.com gives the same school. It is empty
        -- for a school that closed before that site began, and the site holds
        -- a wrong digit on a few sheets, which int_ohhsfbdb_sheet_teams
        -- corrects.
        NULLIF(TRIM(team_number), '') AS team_number,
        NULLIF(TRIM(short_name), '') AS short_name
    FROM source
)

SELECT * FROM staged
