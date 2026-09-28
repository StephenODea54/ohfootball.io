SELECT team_key
FROM {{ ref('dim_teams') }}
GROUP BY team_key
HAVING COUNT(*) FILTER (WHERE is_current) <> 1
