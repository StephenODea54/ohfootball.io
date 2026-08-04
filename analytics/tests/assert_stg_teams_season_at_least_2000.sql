select *
from {{ ref('stg_teams') }}
where season < 2000
