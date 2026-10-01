WITH source AS (
    SELECT * FROM {{ ref('school_locations') }}
),

staged AS (
    SELECT
        NULLIF(TRIM(team_id), '') AS source_id,
        latitude,
        longitude
    FROM source
)

SELECT * FROM staged
