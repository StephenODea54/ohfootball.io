SELECT
    scrape_run_id,
    team_id,
    COUNT(*) AS record_count
FROM {{ ref('stg_teams') }}
GROUP BY scrape_run_id, team_id
HAVING COUNT(*) > 1
