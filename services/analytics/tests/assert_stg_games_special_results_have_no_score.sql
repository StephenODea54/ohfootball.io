SELECT *
FROM {{ ref('stg_games') }}
WHERE (result = 'C' OR notes = 'forfeit')
    AND (source_team_score IS NOT NULL OR opponent_score IS NOT NULL)
