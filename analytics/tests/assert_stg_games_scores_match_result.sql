select *
from {{ ref('stg_games') }}
where notes is null
    and result in ('W', 'L', 'T')
    and (
        source_team_score is null
        or opponent_score is null
        or (result = 'W' and source_team_score <= opponent_score)
        or (result = 'L' and source_team_score >= opponent_score)
        or (result = 'T' and source_team_score != opponent_score)
    )
