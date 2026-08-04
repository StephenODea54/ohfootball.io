select *
from {{ ref('stg_games') }}
where (result = 'C' or notes = 'forfeit')
    and (source_team_score is not null or opponent_score is not null)
