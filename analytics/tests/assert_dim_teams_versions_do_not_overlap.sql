WITH versions AS (
    SELECT
        team_key,
        valid_from,
        valid_to,
        LEAD(valid_from) OVER (
            PARTITION BY team_key
            ORDER BY valid_from
        ) AS next_valid_from
    FROM {{ ref('dim_teams') }}
)

SELECT *
FROM versions
WHERE valid_to IS DISTINCT FROM next_valid_from
