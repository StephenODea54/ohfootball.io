-- The first row of a sheet holds the identifier that joeeitel.com gives the
-- same school, so the two sources join without matching names. That matters,
-- because a name is not a key on either side. The site calls sheet175 "Delphos
-- Jefferson" while joeeitel.com calls the same correct identifier "Jefferson",
-- and eighty names in the warehouse carry more than one identifier.
--
-- Three things can happen to a sheet:
--
--   1. The override list names it. The list wins, because the site holds a
--      wrong digit on five sheets. A list row with an empty identifier asks
--      for a minted one, which is why the presence of the row decides and not
--      its value.
--   2. The sheet carries an identifier and no list row names it. That
--      identifier stands.
--   3. The sheet carries none. Every such school closed before joeeitel.com
--      began, so the warehouse mints an identifier from the name of the sheet,
--      which the site does not change.

WITH latest_run AS (
    SELECT id AS scrape_run_id FROM {{ ohhsfbdb_latest_run() }} AS run (id)
),

teams AS (
    SELECT
        sheet,
        team_number,
        short_name
    FROM {{ ref('stg_ohhsfbdb_teams') }}
    WHERE scrape_run_id = (SELECT scrape_run_id FROM latest_run)
),

names AS (
    SELECT
        sheet,
        MIN(position) AS position,
        MIN(display_name) AS display_name
    FROM {{ ref('stg_ohhsfbdb_index') }}
    WHERE scrape_run_id = (SELECT scrape_run_id FROM latest_run)
    GROUP BY sheet
),

-- The identifier that each of these sheets should carry.
overrides AS (
    SELECT * FROM (
        VALUES
        -- The sheet says 1032, which belongs to Mifflin. This is New Bremen.
        ('sheet432', '1092'),
        -- The sheet says 192, which belongs to Belmont. This is the Dunbar
        -- of Dayton, and not the one of Washington.
        ('sheet183', '476'),
        -- The sheet says 194, which belongs to Belpre. This is Trimble.
        ('sheet608', '1540'),
        -- The sheet says 1744, which belongs to Wyoming. This is Wynford.
        ('sheet700', '1742'),
        -- Warren Western Reserve and West Tech both say 1692, and both
        -- closed before joeeitel.com began, so both take a minted one.
        ('sheet805', NULL),
        ('sheet807', NULL)
    ) AS given (sheet, team_id)
),

resolved AS (
    SELECT
        teams.sheet,
        CASE
            WHEN overrides.sheet IS NOT NULL
                THEN
                    COALESCE(
                        overrides.team_id,
                        '{{ var("ohhsfbdb_minted_prefix", "ohhsfbdb:") }}' || teams.sheet
                    )
            ELSE
                COALESCE(
                    teams.team_number,
                    '{{ var("ohhsfbdb_minted_prefix", "ohhsfbdb:") }}' || teams.sheet
                )
        END AS team_id,
        teams.team_number AS team_number_on_the_sheet,
        overrides.sheet IS NOT NULL AS is_corrected,
        teams.team_number IS NULL AS names_no_identifier,
        COALESCE(names.display_name, teams.short_name) AS name,
        teams.short_name
    FROM teams
    LEFT JOIN names USING (sheet)
    LEFT JOIN overrides USING (sheet)
)

SELECT * FROM resolved
