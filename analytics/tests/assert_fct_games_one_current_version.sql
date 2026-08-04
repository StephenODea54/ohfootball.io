SELECT
    game_key
FROM {{ ref('fct_games') }}
GROUP BY game_key
HAVING COUNT(*) FILTER (WHERE is_current) <> 1
