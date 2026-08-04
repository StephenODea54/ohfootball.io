SELECT *
FROM {{ ref('stg_games') }}
WHERE is_source_team_home AND is_opponent_team_home
