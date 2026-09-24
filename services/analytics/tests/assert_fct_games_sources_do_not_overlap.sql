-- No game key may come from both sites. The two cover different seasons, and an
-- overlap would double a game in the fact table.
WITH joeeitel AS (
    SELECT game_key FROM {{ ref('int_games_canonicalized') }} WHERE season >= 2000
),

ohhsfbdb AS (
    SELECT game_key FROM {{ ref('int_ohhsfbdb_games_canonicalized') }}
)

SELECT game_key FROM joeeitel
INTERSECT
SELECT game_key FROM ohhsfbdb
