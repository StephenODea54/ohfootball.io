SELECT *
FROM {{ ref('fct_games') }}
WHERE is_team_a_home AND is_team_b_home
