SELECT *
FROM {{ ref('stg_teams') }}
WHERE season < 2000
