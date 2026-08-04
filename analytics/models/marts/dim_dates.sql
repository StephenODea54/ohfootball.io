{{ config(
    indexes=[
        {'columns': ['date_key'], 'unique': true},
        {'columns': ['date_day'], 'unique': true}
    ]
) }}

WITH date_bounds AS (
    SELECT
        MIN(game_date) AS first_date,
        MAX(game_date) AS last_date
    FROM {{ ref('int_games_canonicalized') }}
),

date_spine AS (
    SELECT GENERATE_SERIES(first_date, last_date, INTERVAL '1 day')::DATE AS date_day
    FROM date_bounds
)

SELECT
    TO_CHAR(date_day, 'YYYYMMDD')::INTEGER AS date_key,
    date_day,
    EXTRACT(ISOYEAR FROM date_day)::SMALLINT AS iso_year,
    EXTRACT(WEEK FROM date_day)::SMALLINT AS iso_week,
    EXTRACT(YEAR FROM date_day)::SMALLINT AS calendar_year,
    EXTRACT(QUARTER FROM date_day)::SMALLINT AS calendar_quarter,
    EXTRACT(MONTH FROM date_day)::SMALLINT AS month_number,
    TO_CHAR(date_day, 'FMMonth') AS month_name,
    EXTRACT(DAY FROM date_day)::SMALLINT AS day_of_month,
    EXTRACT(ISODOW FROM date_day)::SMALLINT AS iso_day_of_week,
    TO_CHAR(date_day, 'FMDay') AS day_name,
    EXTRACT(ISODOW FROM date_day) IN (6, 7) AS is_weekend
FROM date_spine
