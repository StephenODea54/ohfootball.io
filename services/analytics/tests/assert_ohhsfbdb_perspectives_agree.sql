{{ config(severity='warn') }}

-- The site of the backfill is kept by hand, and the two schools of a game
-- sometimes wrote different scores. Such a game is reported rather than
-- corrected, because neither school is more believable than the other.
--
-- This is a warning. A failure would stop a build over a handful of rows that
-- no change to this warehouse can fix.
SELECT
    season,
    game_date,
    team_a_id,
    team_b_id,
    team_a_score,
    team_b_score
FROM {{ ref('int_ohhsfbdb_games_canonicalized') }}
WHERE has_conflicting_perspectives
