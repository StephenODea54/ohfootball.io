WITH source AS (
    SELECT * FROM {{ source('ohfootball_raw', 'ohhsfbdb_season_summaries') }}
),

staged AS (
    SELECT
        id AS summary_record_id,
        scrape_run_id,
        NULLIF(TRIM(sheet), '') AS sheet,
        season,
        NULLIF(TRIM(conference), '') AS conference,
        {{ ohhsfbdb_count('regular_wins') }} AS regular_wins,
        {{ ohhsfbdb_count('regular_losses') }} AS regular_losses,
        {{ ohhsfbdb_count('regular_ties') }} AS regular_ties,
        {{ ohhsfbdb_count('conference_wins') }} AS conference_wins,
        {{ ohhsfbdb_count('conference_losses') }} AS conference_losses,
        {{ ohhsfbdb_count('conference_ties') }} AS conference_ties,
        {{ ohhsfbdb_count('playoff_wins') }} AS playoff_wins,
        {{ ohhsfbdb_count('playoff_losses') }} AS playoff_losses,
        NULLIF(TRIM(division), '') AS division,
        NULLIF(TRIM(region), '') AS region,
        {{ ohhsfbdb_count('rank') }} AS state_rank
    FROM source
)

SELECT * FROM staged
