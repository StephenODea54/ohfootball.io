-- A game that is gone and then listed again leaves a gap between two versions,
-- so versions need not touch. They must not overlap.
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
WHERE
    next_valid_from IS NOT NULL
    AND (valid_to IS NULL OR valid_to > next_valid_from)
