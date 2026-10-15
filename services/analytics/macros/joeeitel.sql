{#
    True when a joeeitel.com team row is a placeholder. The scraper writes such
    a row for a team whose page is empty. It holds the identifier, the name and
    at most the state, so every other attribute is null. The state is not part
    of the rule, because the placeholder of an OHSAA team holds the state of
    Ohio.
#}
{% macro joeeitel_is_placeholder(relation) -%}
    (
        {{ relation }}.mascot IS NULL
        AND {{ relation }}.city IS NULL
        AND {{ relation }}.county IS NULL
        AND {{ relation }}.primary_color_hex IS NULL
        AND {{ relation }}.secondary_color_hex IS NULL
        AND {{ relation }}.division IS NULL
        AND {{ relation }}.region IS NULL
    )
{%- endmacro %}


{#
    The typed rows of the schedules of joeeitel.com. The schedules of the OHSAA teams and the
    schedules of their opponents from other states have the same columns, so both staging models
    read them with this macro.
#}
{% macro joeeitel_stage_schedule(relation) -%}
    WITH source AS (
        SELECT * FROM {{ relation }}
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
            END AS is_playoff_game,
            -- The site marks a game that the OHSAA leaves out of its computer points with a star
            -- after the result, for example a game against a club team.
            POSITION('*' IN COALESCE(result, '')) = 0 AS counts_in_ohsaa_rating
        FROM source
    )

    SELECT * FROM staged
{%- endmacro %}
