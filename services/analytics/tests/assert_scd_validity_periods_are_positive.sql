SELECT
    'dim_teams' AS model_name,
    team_version_key AS version_key,
    valid_from,
    valid_to
FROM {{ ref('dim_teams') }}
WHERE valid_to <= valid_from

UNION ALL

SELECT
    'fct_games' AS model_name,
    game_version_key AS version_key,
    valid_from,
    valid_to
FROM {{ ref('fct_games') }}
WHERE valid_to <= valid_from
