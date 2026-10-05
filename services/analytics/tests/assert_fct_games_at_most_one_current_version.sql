-- A game that a later run no longer lists has no current version, so a key can
-- have none. It can never have two.
SELECT game_key
FROM {{ ref('fct_games') }}
GROUP BY game_key
HAVING COUNT(*) FILTER (WHERE is_current) > 1
