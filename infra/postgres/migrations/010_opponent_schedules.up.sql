-- Keep the schedules of the opponents from other states.
--
-- The OHSAA computer points give a win over a team from another state the points of its division
-- for each win of that team. The divisor also counts the games of that team. The crawler already
-- reads the page of each such opponent, but it kept the team row only. This table holds the
-- schedule rows of those pages. They are kept apart from ohfootball_raw.games, so the canonical
-- games, the rating and the dataset do not change. The columns are the columns of
-- ohfootball_raw.games.

CREATE TABLE IF NOT EXISTS ohfootball_raw.opponent_games (
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

CREATE INDEX IF NOT EXISTS ohfootball_raw_opponent_games_run_id_idx
ON ohfootball_raw.opponent_games (scrape_run_id);
CREATE INDEX IF NOT EXISTS ohfootball_raw_opponent_games_season_source_team_id_idx
ON ohfootball_raw.opponent_games (season, source_team_id);
