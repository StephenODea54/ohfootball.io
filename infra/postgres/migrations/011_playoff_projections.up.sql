-- Store the playoff projection of each Ohio team.
--
-- The rating service plays the rest of a regular season many times, seeds each region at the end
-- of each run and plays the playoff games of each region. These tables hold what it counted. One
-- projection is one season and one as-of date, and the service replaces a projection whole. The
-- API reads the newest projection of a season.

CREATE TABLE IF NOT EXISTS ohfootball_marts.dim_playoff_projections (
    season        SMALLINT NOT NULL,
    as_of_date    DATE NOT NULL,
    runs          INTEGER NOT NULL CHECK (runs > 0),
    seed          BIGINT NOT NULL,
    qualifiers    SMALLINT NOT NULL,
    byes          SMALLINT NOT NULL,
    home_games    SMALLINT NOT NULL,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (season, as_of_date)
);

-- One row for each Ohio team with a region. The record, the two levels, the divisor and the
-- average are the computer points after the weeks that are over. The odds come from the runs.
-- expected_seed is the mean place of the team in its region. remaining_game_keys lists the
-- remaining games of the team in the order of their dates, and the four lists of odds follow the
-- same order: the chance to qualify and to play at home in the runs in which the team won that
-- game, and in the runs in which it lost it. An element is null when no run had that result.
CREATE TABLE IF NOT EXISTS ohfootball_marts.fct_playoff_outlooks (
    team_key               UUID NOT NULL,
    season                 SMALLINT NOT NULL,
    as_of_date             DATE NOT NULL,
    region                 SMALLINT NOT NULL,
    wins                   SMALLINT NOT NULL,
    losses                 SMALLINT NOT NULL,
    ties                   SMALLINT NOT NULL,
    level_one              DOUBLE PRECISION NOT NULL,
    level_two              DOUBLE PRECISION NOT NULL,
    divisor                SMALLINT NOT NULL,
    average                DOUBLE PRECISION NOT NULL,
    qualify_probability    DOUBLE PRECISION NOT NULL,
    home_probability       DOUBLE PRECISION NOT NULL,
    bye_probability        DOUBLE PRECISION NOT NULL,
    region_win_probability DOUBLE PRECISION NOT NULL,
    expected_seed          DOUBLE PRECISION NOT NULL,
    remaining_game_keys    UUID[] NOT NULL,
    qualify_if_win         DOUBLE PRECISION[] NOT NULL,
    qualify_if_loss        DOUBLE PRECISION[] NOT NULL,
    home_if_win            DOUBLE PRECISION[] NOT NULL,
    home_if_loss           DOUBLE PRECISION[] NOT NULL,
    PRIMARY KEY (team_key, as_of_date)
);

CREATE INDEX IF NOT EXISTS fct_playoff_outlooks_season_idx
ON ohfootball_marts.fct_playoff_outlooks (season, as_of_date);

-- The odds of a team for each final record of the regular season. The runs play no ties, so the
-- ties of a team are the ties of its record. The averages are the final average at the 5th, the
-- 50th and the 95th percentile of the runs with that record.
CREATE TABLE IF NOT EXISTS ohfootball_marts.fct_playoff_record_odds (
    team_key            UUID NOT NULL,
    season              SMALLINT NOT NULL,
    as_of_date          DATE NOT NULL,
    wins                SMALLINT NOT NULL,
    losses              SMALLINT NOT NULL,
    probability         DOUBLE PRECISION NOT NULL,
    runs                INTEGER NOT NULL,
    low_average         DOUBLE PRECISION NOT NULL,
    median_average      DOUBLE PRECISION NOT NULL,
    high_average        DOUBLE PRECISION NOT NULL,
    qualify_probability DOUBLE PRECISION NOT NULL,
    home_probability    DOUBLE PRECISION NOT NULL,
    bye_probability     DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (team_key, as_of_date, wins)
);

CREATE INDEX IF NOT EXISTS fct_playoff_record_odds_season_idx
ON ohfootball_marts.fct_playoff_record_odds (season, as_of_date);
