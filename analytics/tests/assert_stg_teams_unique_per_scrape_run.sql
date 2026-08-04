select
    scrape_run_id,
    team_id,
    count(*) as record_count
from {{ ref('stg_teams') }}
group by scrape_run_id, team_id
having count(*) > 1
