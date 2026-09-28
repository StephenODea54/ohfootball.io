-- The backfill covers 1972 to 1999. The other site covers 2000 onward. A season
-- outside that range means the crawl kept rows it should have dropped, and the
-- two sources would then describe the same season.
SELECT
    season,
    COUNT(*) AS game_count
FROM {{ ref('stg_ohhsfbdb_games') }}
GROUP BY season
HAVING season < 1972 OR season > 1999
