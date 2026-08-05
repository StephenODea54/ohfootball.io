select *
from {{ ref('stg_games') }}
where notes is null
    and result in ('W', 'L', 'T')
    and source_team_score is not null
    and opponent_score is not null
    and (
        (result = 'W' and source_team_score <= opponent_score)
        or (result = 'L' and source_team_score >= opponent_score)
        or (result = 'T' and source_team_score != opponent_score)
    )
