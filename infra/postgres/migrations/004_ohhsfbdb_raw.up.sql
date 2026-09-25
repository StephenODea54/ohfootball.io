-- The raw layer of ohhsfbdb.net.
--
-- The site keeps one workbook. Sheet one is an index of every school, and each
-- other sheet holds the whole history of one school. A sheet carries a game log
-- and a block of season records side by side, and the two do not line up row by
-- row, so each becomes its own table.
--
-- These tables are separate from ohfootball_raw.teams and ohfootball_raw.games,
-- which hold another site. Each raw table keeps the shape of the site it came
-- from. The columns of this site that the other one lacks, such as the week of
-- the season, the seed of a team, and the ground of the game, then need no
-- place to hide.
--
-- Almost every column is text, because the raw layer records what the page
-- said. The site holds a wrong digit in the identifier of five schools, so a
-- later layer corrects the identifier, and this layer must not lose the
-- evidence. The season is an integer because the reader writes a row only when
-- the cell holds four digits.

CREATE TABLE IF NOT EXISTS ohfootball_raw.ohhsfbdb_index (
    id            UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    scrape_run_id UUID NOT NULL REFERENCES ohfootball_metadata.scrape_runs(id),
    position      INTEGER NOT NULL,
    school_name   TEXT NOT NULL,
    sheet         TEXT NOT NULL
);

COMMENT ON TABLE ohfootball_raw.ohhsfbdb_index IS
    'The index sheet. It is the only page that holds the full name of a school. '
    'Two rows may name one sheet, because one link on the site is wrong.';

CREATE TABLE IF NOT EXISTS ohfootball_raw.ohhsfbdb_teams (
    id            UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    scrape_run_id UUID NOT NULL REFERENCES ohfootball_metadata.scrape_runs(id),
    sheet         TEXT NOT NULL,
    team_number   TEXT,
    short_name    TEXT
);

COMMENT ON COLUMN ohfootball_raw.ohhsfbdb_teams.team_number IS
    'The identifier that joeeitel.com gives the same school. It is empty for a '
    'school that closed before that site began.';

CREATE TABLE IF NOT EXISTS ohfootball_raw.ohhsfbdb_games (
    id                  UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    scrape_run_id       UUID NOT NULL REFERENCES ohfootball_metadata.scrape_runs(id),
    sheet               TEXT NOT NULL,
    season              INTEGER NOT NULL,
    week                TEXT,
    game_date           TEXT,
    day_of_week         TEXT,
    home_away           TEXT,
    opponent_name       TEXT,
    opponent_sheet      TEXT,
    team_score          TEXT,
    opponent_score      TEXT,
    overtime            TEXT,
    result              TEXT,
    opponent_conference TEXT,
    opponent_division   TEXT,
    opponent_region     TEXT,
    playoff_round       TEXT,
    team_seed           TEXT,
    opponent_seed       TEXT,
    stadium             TEXT,
    location            TEXT
);

COMMENT ON TABLE ohfootball_raw.ohhsfbdb_games IS
    'One row is one school''s view of one game, not a game. Two schools that '
    'played each other both list it, so a consumer must combine the two rows.';

COMMENT ON COLUMN ohfootball_raw.ohhsfbdb_games.home_away IS
    'H, A, or N. N is a game on neither ground, which the site uses for a game '
    'of the state tournament.';

COMMENT ON COLUMN ohfootball_raw.ohhsfbdb_games.opponent_sheet IS
    'The sheet that the opponent cell links to, when it links to one. The site '
    'links the opponent on some rows and not on others, and the links are not '
    'the same in both directions.';

CREATE TABLE IF NOT EXISTS ohfootball_raw.ohhsfbdb_season_summaries (
    id                UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    scrape_run_id     UUID NOT NULL REFERENCES ohfootball_metadata.scrape_runs(id),
    sheet             TEXT NOT NULL,
    season            INTEGER NOT NULL,
    conference        TEXT,
    regular_wins      TEXT,
    regular_losses    TEXT,
    regular_ties      TEXT,
    conference_wins   TEXT,
    conference_losses TEXT,
    conference_ties   TEXT,
    playoff_wins      TEXT,
    playoff_losses    TEXT,
    division          TEXT,
    region            TEXT,
    rank              TEXT
);

COMMENT ON TABLE ohfootball_raw.ohhsfbdb_season_summaries IS
    'One row for each season of one school. It is the only place the site '
    'states the conference, the division, the region, and the rank of the '
    'school that owns the sheet. The game rows state those of the opponent.';

CREATE INDEX IF NOT EXISTS ohfootball_raw_ohhsfbdb_index_run_id_idx
ON ohfootball_raw.ohhsfbdb_index (scrape_run_id);
CREATE INDEX IF NOT EXISTS ohfootball_raw_ohhsfbdb_teams_run_id_idx
ON ohfootball_raw.ohhsfbdb_teams (scrape_run_id);
CREATE INDEX IF NOT EXISTS ohfootball_raw_ohhsfbdb_teams_sheet_idx
ON ohfootball_raw.ohhsfbdb_teams (sheet);
CREATE INDEX IF NOT EXISTS ohfootball_raw_ohhsfbdb_games_run_id_idx
ON ohfootball_raw.ohhsfbdb_games (scrape_run_id);
CREATE INDEX IF NOT EXISTS ohfootball_raw_ohhsfbdb_games_season_sheet_idx
ON ohfootball_raw.ohhsfbdb_games (season, sheet);
CREATE INDEX IF NOT EXISTS ohfootball_raw_ohhsfbdb_games_opponent_idx
ON ohfootball_raw.ohhsfbdb_games (season, opponent_name);
CREATE INDEX IF NOT EXISTS ohfootball_raw_ohhsfbdb_summaries_run_id_idx
ON ohfootball_raw.ohhsfbdb_season_summaries (scrape_run_id);
