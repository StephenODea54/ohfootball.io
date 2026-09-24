CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS ohfootball_metadata;

CREATE TABLE IF NOT EXISTS ohfootball_metadata.scrape_runs (
    id              UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    scraper_version TEXT NOT NULL,
    root_url        TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN (
        'running',
        'succeeded',
        'failed'
    )),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    error_message   TEXT
);

CREATE SCHEMA IF NOT EXISTS ohfootball_raw;

CREATE TABLE IF NOT EXISTS ohfootball_raw.teams (
    id              UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    scrape_run_id   UUID NOT NULL REFERENCES ohfootball_metadata.scrape_runs(id),
    season          INTEGER NOT NULL,
    team_id         TEXT NOT NULL,
    name            TEXT,
    mascot          TEXT,
    city            TEXT,
    state           TEXT,
    county          TEXT,
    primary_color   TEXT,
    secondary_color TEXT,
    division        TEXT,
    region          TEXT
);

CREATE TABLE IF NOT EXISTS ohfootball_raw.games (
    id               UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    scrape_run_id    UUID NOT NULL REFERENCES ohfootball_metadata.scrape_runs(id),
    season           INTEGER NOT NULL,
    source_team_id   TEXT,
    game_date        TEXT,
    home_away        TEXT,
    opponent_team_id TEXT,
    result           TEXT,
    score            TEXT,
    notes            TEXT,
    playoff          TEXT
);

CREATE INDEX ohfootball_raw_teams_run_id_idx
ON ohfootball_raw.teams (scrape_run_id);
CREATE INDEX ohfootball_raw_teams_season_team_id_idx
ON ohfootball_raw.teams (season, team_id);
CREATE INDEX ohfootball_raw_games_run_id_idx
ON ohfootball_raw.games (scrape_run_id);
CREATE INDEX ohfootball_raw_games_season_source_team_id_idx
ON ohfootball_raw.games (season, source_team_id);
CREATE INDEX ohfootball_raw_games_season_opponent_team_id_idx
ON ohfootball_raw.games (season, opponent_team_id);
