select games.*
from {{ ref('stg_games') }} as games
left join {{ ref('stg_teams') }} as teams
    on games.season = teams.season
    and games.source_team_id = teams.team_id
    and games.scrape_run_id = teams.scrape_run_id
where teams.team_record_id is null
