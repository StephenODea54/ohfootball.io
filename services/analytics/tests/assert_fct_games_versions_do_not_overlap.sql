WITH versions AS (
    SELECT
        game_key,
        valid_from,
        valid_to,
        LEAD(valid_from) OVER (
            PARTITION BY game_key
            ORDER BY valid_from
        ) AS next_valid_from
    FROM {{ ref('fct_games') }}
)

SELECT *
FROM versions
WHERE valid_to IS DISTINCT FROM next_valid_from
