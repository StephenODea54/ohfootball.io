-- One row for each sheet of ohhsfbdb.net, with the identifier of its school.
--
-- The first row of a sheet holds the identifier that joeeitel.com gives the
-- same school, so the two sources join without matching names. That matters,
-- because a name is not a key on either side. The site calls sheet175 "Delphos
-- Jefferson" while joeeitel.com calls the same correct identifier "Jefferson",
-- and eighty names in the warehouse carry more than one identifier.
--
-- Three things can happen to a sheet:
--
--   1. The seed names it. The seed wins, because the site holds a wrong digit
--      on five sheets. A seed row with an empty identifier asks for a minted
--      one, which is why the presence of the row decides and not its value.
--   2. The sheet carries an identifier and no seed row names it. That
--      identifier stands.
--   3. The sheet carries none. Every such school closed before joeeitel.com
--      began, so the warehouse mints an identifier from the name of the sheet,
--      which the site does not change.

WITH latest_run AS (
    SELECT id AS scrape_run_id FROM {{ ohhsfbdb_latest_run() }} AS run(id)
),

teams AS (
    SELECT sheet, team_number, short_name
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

overrides AS (
    SELECT
        sheet,
        NULLIF(TRIM(team_id), '') AS team_id
    FROM {{ ref('ohhsfbdb_team_overrides') }}
),

resolved AS (
    SELECT
        teams.sheet,
        CASE
            WHEN overrides.sheet IS NOT NULL
                THEN COALESCE(overrides.team_id, '{{ var("ohhsfbdb_minted_prefix", "ohhsfbdb:") }}' || teams.sheet)
            ELSE COALESCE(teams.team_number, '{{ var("ohhsfbdb_minted_prefix", "ohhsfbdb:") }}' || teams.sheet)
        END AS team_id,
        teams.team_number AS team_number_on_the_sheet,
        overrides.sheet IS NOT NULL AS is_corrected_by_seed,
        teams.team_number IS NULL AS names_no_identifier,
        COALESCE(names.display_name, teams.short_name) AS name,
        teams.short_name
    FROM teams
    LEFT JOIN names USING (sheet)
    LEFT JOIN overrides USING (sheet)
)

SELECT * FROM resolved
