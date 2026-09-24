WITH source AS (
    SELECT * FROM {{ source('ohfootball_raw', 'teams') }}
),

staged AS (
    SELECT
        id AS team_record_id,
        scrape_run_id,
        season,
        NULLIF(TRIM(team_id), '') AS team_id,
        NULLIF(TRIM(name), '') AS name,
        NULLIF(TRIM(mascot), '') AS mascot,
        NULLIF(TRIM(city), '') AS city,
        UPPER(NULLIF(TRIM(state), '')) AS state_code,
        NULLIF(TRIM(county), '') AS county,
        UPPER(NULLIF(TRIM(primary_color), '')) AS primary_color_hex,
        UPPER(NULLIF(TRIM(secondary_color), '')) AS secondary_color_hex,
        CASE
            WHEN NULLIF(TRIM(division), '') ~ '^[0-9]+$'
            THEN TRIM(division)::SMALLINT
            ELSE {{ roman_numeral_to_int('division') }}
        END AS division,
        NULLIF(TRIM(region), '')::SMALLINT AS region
    FROM source
)

SELECT * FROM staged
