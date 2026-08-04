SELECT *
FROM {{ ref('int_games_canonicalized') }}
WHERE team_a_id = team_b_id
