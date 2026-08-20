SELECT *
FROM {{ ref('stg_games') }}
WHERE notes IS NULL
    AND result IN ('W', 'L', 'T')
    AND source_team_score IS NOT NULL
    AND opponent_score IS NOT NULL
    AND (
        (result = 'W' AND source_team_score <= opponent_score)
        OR (result = 'L' AND source_team_score >= opponent_score)
        OR (result = 'T' AND source_team_score <> opponent_score)
    )
