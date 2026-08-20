SELECT games.*
FROM {{ ref('stg_games') }} AS games
LEFT JOIN {{ ref('stg_teams') }} AS teams
    ON games.season = teams.season
   AND games.source_team_id = teams.team_id
   AND games.scrape_run_id = teams.scrape_run_id
WHERE teams.team_record_id IS NULL
