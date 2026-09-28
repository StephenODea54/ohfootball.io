-- The opponent cell holds a name, not an identifier, so the name must lead
-- somewhere. Four things resolve it, in this order.
--
--   1. The cell links to the sheet of the opponent. The site links about one
--      row in seven, and the links are not the same in both directions, so
--      this settles a minority of rows and nothing more.
--   2. The name matches a name of the index exactly. The index names are
--      unique, so a match names one sheet. This settles most rows.
--   3. The two sheets are matched to each other. Both schools list the game, so
--      the row of the other school carries the same season, the same day, and
--      the same scores the other way about. The match also requires that the
--      other row names this school, which is what keeps two unrelated games
--      with the same score on the same day apart.
--   4. The name marks a state or a province other than Ohio. Such a school has
--      no sheet, so the warehouse mints an identifier from the name.
--
-- A name that survives all four is left unresolved and flagged. That loses no
-- game between two schools of Ohio, because the school on the other side keeps
-- its own copy of the game, where this school resolves.

WITH latest_run AS (
    SELECT id AS scrape_run_id FROM {{ ohhsfbdb_latest_run() }} AS run (id)
),

games AS (
    SELECT *
    FROM {{ ref('stg_ohhsfbdb_games') }}
    WHERE scrape_run_id = (SELECT scrape_run_id FROM latest_run)
),

sheet_teams AS (
    SELECT * FROM {{ ref('int_ohhsfbdb_sheet_teams') }}
),

-- Every name that leads to a sheet, whether it carries the years of a name
-- change or not.
index_names AS (
    SELECT
        school_name AS name,
        sheet
    FROM {{ ref('stg_ohhsfbdb_index') }}
    WHERE scrape_run_id = (SELECT scrape_run_id FROM latest_run)
    UNION
    SELECT
        display_name AS name,
        sheet
    FROM {{ ref('stg_ohhsfbdb_index') }}
    WHERE scrape_run_id = (SELECT scrape_run_id FROM latest_run)
),

-- A name that leads to exactly one sheet. A name that leads to more than one
-- resolves nothing, because the warehouse must not guess which school it was.
unique_index_names AS (
    SELECT
        name,
        MIN(sheet) AS sheet
    FROM index_names
    GROUP BY name
    HAVING COUNT(DISTINCT sheet) = 1
),

-- The names by which a sheet may be called on the sheet of another school.
sheet_aliases AS (
    SELECT
        sheet,
        name
    FROM index_names
    UNION
    SELECT
        sheet,
        short_name AS name
    FROM sheet_teams WHERE short_name IS NOT NULL
),

-- The row of the other school, for the same game.
mirrors AS (
    SELECT
        a.game_record_id,
        MIN(b.sheet) AS opponent_sheet,
        COUNT(DISTINCT b.sheet) AS candidate_count
    FROM games AS a
    INNER JOIN games AS b
        ON
            b.season = a.season
            AND b.game_date = a.game_date
            AND b.sheet <> a.sheet
            AND b.source_team_score IS NOT DISTINCT FROM a.opponent_score
            AND b.opponent_score IS NOT DISTINCT FROM a.source_team_score
            AND b.is_source_team_home = a.is_opponent_team_home
            AND b.is_opponent_team_home = a.is_source_team_home
    INNER JOIN sheet_aliases AS alias
        ON
            alias.sheet = a.sheet
            AND alias.name = b.opponent_name
    GROUP BY a.game_record_id
),

resolved AS (
    SELECT
        games.*,
        CASE
            WHEN games.opponent_sheet IS NOT NULL THEN 'link'
            WHEN unique_index_names.sheet IS NOT NULL THEN 'name'
            WHEN mirrors.candidate_count = 1 THEN 'match'
            WHEN {{ ohhsfbdb_is_out_of_state('games.opponent_name') }} THEN 'out of state'
        END AS opponent_resolved_by,
        COALESCE(
            games.opponent_sheet,
            unique_index_names.sheet,
            CASE WHEN mirrors.candidate_count = 1 THEN mirrors.opponent_sheet END
        ) AS resolved_opponent_sheet
    FROM games
    LEFT JOIN unique_index_names ON unique_index_names.name = games.opponent_name
    LEFT JOIN mirrors USING (game_record_id)
),

with_identifiers AS (
    SELECT
        resolved.game_record_id,
        resolved.scrape_run_id,
        resolved.sheet,
        source_team.team_id AS source_team_id,
        COALESCE(
            opponent_team.team_id,
            CASE
                WHEN resolved.opponent_resolved_by = 'out of state'
                    THEN
                        '{{ var("ohhsfbdb_minted_prefix", "ohhsfbdb:") }}' || resolved.opponent_name
            END
        ) AS opponent_team_id,
        resolved.opponent_name,
        resolved.opponent_resolved_by,
        resolved.season,
        resolved.week,
        resolved.game_date,
        resolved.is_source_team_home,
        resolved.is_opponent_team_home,
        resolved.source_team_score,
        resolved.opponent_score,
        resolved.result,
        resolved.notes,
        resolved.is_playoff_game,
        resolved.playoff_round,
        resolved.opponent_conference,
        resolved.opponent_division,
        resolved.opponent_region,
        resolved.stadium,
        resolved.location
    FROM resolved
    INNER JOIN sheet_teams AS source_team ON source_team.sheet = resolved.sheet
    LEFT JOIN sheet_teams AS opponent_team ON opponent_team.sheet = resolved.resolved_opponent_sheet
)

SELECT
    *,
    opponent_team_id IS NULL AS is_opponent_unresolved
FROM with_identifiers
