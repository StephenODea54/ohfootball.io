-- Two sheets must never claim one identifier.
--
-- The site holds a wrong digit in the identifier of five schools, and each
-- wrong digit names a school that already exists. A join on the identifier
-- alone would attach ten schools to five identifiers. The override list
-- corrects them, and this test reports any that it does not, by name, so an
-- operator can add the row.
SELECT
    team_id,
    COUNT(*) AS sheet_count,
    STRING_AGG(sheet || ' (' || name || ')', ', ' ORDER BY sheet) AS sheets
FROM {{ ref('int_ohhsfbdb_sheet_teams') }}
GROUP BY team_id
HAVING COUNT(*) > 1
