WITH source AS (
    SELECT * FROM {{ source('ohfootball_raw', 'ohhsfbdb_index') }}
),

staged AS (
    SELECT
        id AS index_record_id,
        scrape_run_id,
        position,
        NULLIF(TRIM(school_name), '') AS school_name,
        -- A school that changed its name appears twice, and each name carries
        -- the years it was used, as in "Akron Garfield (-2016)". The bracket
        -- holds four digits, so a bracket that names a place, such as
        -- "Perry (Lake County)", is left alone.
        NULLIF(TRIM(REGEXP_REPLACE(school_name, '\s*\(-?[0-9]{4}-?\)$', '')), '') AS display_name,
        NULLIF(TRIM(sheet), '') AS sheet
    FROM source
)

SELECT * FROM staged
