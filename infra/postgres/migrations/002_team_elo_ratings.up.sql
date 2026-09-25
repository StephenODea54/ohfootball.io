CREATE SCHEMA IF NOT EXISTS ohfootball_marts;

CREATE TABLE IF NOT EXISTS ohfootball_marts.fct_team_elo_ratings (
    team_key      UUID NOT NULL,
    season        SMALLINT NOT NULL,
    as_of_date    DATE NOT NULL,
    elo_rating    DOUBLE PRECISION NOT NULL,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_key, as_of_date),
    CHECK (season >= 2000),
    CHECK (elo_rating > 0)
);

CREATE INDEX IF NOT EXISTS fct_team_elo_ratings_season_snapshot_idx
ON ohfootball_marts.fct_team_elo_ratings (
    season,
    as_of_date DESC,
    elo_rating DESC
);
