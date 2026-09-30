-- Keep private snapshots of the recruiting data of CollegeFootballData.
--
-- The recruiting API gives the latest rating of each recruit. That rating is
-- set after the senior season, so a model that reads it for a past season
-- reads the future. The weekly run stores the answer of the API one time each
-- week for the three classes that are still in high school. A later model can
-- then read what was known before the games of that week.
--
-- The terms of CollegeFootballData allow private storage and model training.
-- They do not allow the raw records to be published. Thus nothing that
-- publishes reads this schema: not the API, not the download, not the dataset,
-- and not dbt. Only the recruiting package reads and writes it.
--
-- Every service connects as the owner of the warehouse, and the owner keeps
-- access to this schema. The REVOKE below only removes the access of PUBLIC.
-- The control is a test in infra/postgres/tests: it fails when a file outside
-- the recruiting package, the migrations and the docs names this schema.
--
-- One snapshot is one class on one date. The recruits of a snapshot stay in
-- the order that the API gave them. Each row holds the full record as JSON and
-- some typed columns for joins. The two tables are written in one transaction,
-- so a snapshot is complete or it is not there. A snapshot is written one time.
-- A second run on the same date keeps the first snapshot and writes nothing.

CREATE SCHEMA IF NOT EXISTS ohfootball_private;

REVOKE ALL ON SCHEMA ohfootball_private FROM public;

COMMENT ON SCHEMA ohfootball_private IS
'Source data that the terms of its provider do not let us publish. '
'Nothing that publishes may read this schema.';

CREATE TABLE IF NOT EXISTS ohfootball_private.recruiting_snapshots (
    snapshot_date   DATE NOT NULL,
    class_year      SMALLINT NOT NULL,
    season          SMALLINT NOT NULL,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_url      TEXT NOT NULL,
    record_count    INTEGER NOT NULL,
    calls_remaining INTEGER,
    PRIMARY KEY (snapshot_date, class_year),
    CHECK (class_year >= 2000),
    CHECK (class_year > season),
    CHECK (record_count >= 0)
);

COMMENT ON COLUMN ohfootball_private.recruiting_snapshots.calls_remaining IS
'The x-calllimit-remaining header of the answer. '
'NULL when the header was missing or was not a whole number.';

CREATE TABLE IF NOT EXISTS ohfootball_private.recruits (
    snapshot_date  DATE NOT NULL,
    class_year     SMALLINT NOT NULL,
    ordinal        INTEGER NOT NULL,
    cfbd_id        BIGINT,
    athlete_id     BIGINT,
    name           TEXT,
    school         TEXT,
    city           TEXT,
    state_province TEXT,
    position       TEXT,
    stars          SMALLINT,
    rating         DOUBLE PRECISION,
    ranking        INTEGER,
    committed_to   TEXT,
    record         JSONB NOT NULL,
    PRIMARY KEY (snapshot_date, class_year, ordinal),
    FOREIGN KEY (snapshot_date, class_year)
    REFERENCES ohfootball_private.recruiting_snapshots (snapshot_date, class_year)
    ON DELETE CASCADE,
    CHECK (ordinal >= 0)
);

COMMENT ON COLUMN ohfootball_private.recruits.ordinal IS
'The position of the record in the answer of the API, from 0.';

CREATE INDEX IF NOT EXISTS recruits_class_school_idx
ON ohfootball_private.recruits (class_year, school);

CREATE INDEX IF NOT EXISTS recruits_cfbd_id_snapshot_idx
ON ohfootball_private.recruits (cfbd_id, snapshot_date);
