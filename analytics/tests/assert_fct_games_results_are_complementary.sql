SELECT *
FROM {{ ref('fct_games') }}
WHERE NOT (
    notes = 'double forfeit'
    AND team_a_result = 'L'
    AND team_b_result = 'L'
)
AND CASE team_a_result
        WHEN 'W' THEN team_b_result <> 'L'
        WHEN 'L' THEN team_b_result <> 'W'
        ELSE team_b_result IS DISTINCT FROM team_a_result
    END
