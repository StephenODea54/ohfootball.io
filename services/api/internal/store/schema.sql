-- The deployed API reads a snapshot of the warehouse marts from a single SQLite file. The pipeline
-- writes the file once per run and the API only reads it, so the file never changes while the API
-- is running.
--
-- Two things differ from the marts in Postgres. Rows that the warehouse marks as superseded are
-- left out when the file is written, so no query filters on a current flag. Dates are stored as
-- text in YYYY-MM-DD form, which is the form the GraphQL schema returns, so no query converts a
-- date.
--
-- Every index below serves a query in sqlite.go. Keep them in step. A missing index turns a point
-- lookup into a scan of the whole table.

CREATE TABLE dim_teams (
    team_key            TEXT    NOT NULL PRIMARY KEY,
    source_id           TEXT    NOT NULL,
    season              INTEGER NOT NULL,
    state_code          TEXT,
    name                TEXT    NOT NULL,
    mascot              TEXT,
    city                TEXT,
    division            INTEGER,
    region              INTEGER,
    primary_color_hex   TEXT,
    secondary_color_hex TEXT
);

CREATE INDEX dim_teams_season ON dim_teams (season);
CREATE INDEX dim_teams_source_id ON dim_teams (source_id, season);

CREATE TABLE dim_dates (
    date_key INTEGER NOT NULL PRIMARY KEY,
    date_day TEXT    NOT NULL
);

CREATE TABLE fct_games (
    game_key        TEXT    NOT NULL PRIMARY KEY,
    season          INTEGER NOT NULL,
    game_date_key   INTEGER NOT NULL,
    team_a_key      TEXT    NOT NULL,
    team_b_key      TEXT    NOT NULL,
    is_team_a_home  INTEGER NOT NULL,
    is_team_b_home  INTEGER NOT NULL,
    team_a_result   TEXT    NOT NULL,
    team_b_result   TEXT    NOT NULL,
    team_a_score    INTEGER,
    team_b_score    INTEGER,
    is_playoff_game INTEGER NOT NULL,
    notes           TEXT
);

CREATE INDEX fct_games_season_team_a ON fct_games (season, team_a_key);
CREATE INDEX fct_games_season_team_b ON fct_games (season, team_b_key);

CREATE TABLE fct_team_elo_ratings (
    team_key   TEXT    NOT NULL,
    season     INTEGER NOT NULL,
    elo_rating REAL    NOT NULL,
    as_of_date TEXT    NOT NULL,
    PRIMARY KEY (team_key, season, as_of_date)
);

CREATE INDEX fct_team_elo_ratings_season ON fct_team_elo_ratings (season, as_of_date);

CREATE TABLE fct_game_predictions (
    game_key               TEXT NOT NULL PRIMARY KEY,
    game_date              TEXT NOT NULL,
    team_a_rating          REAL NOT NULL,
    team_b_rating          REAL NOT NULL,
    team_a_win_probability REAL NOT NULL
);
