CREATE SCHEMA IF NOT EXISTS ohfootball_marts;

-- One pregame prediction per completed game. The ratings stored here are the ratings both teams
-- carried into that game, not their end of season ratings, so a prediction can be read back
-- without replaying the season.
CREATE TABLE IF NOT EXISTS ohfootball_marts.fct_game_predictions (
    game_key               UUID PRIMARY KEY,
    season                 SMALLINT NOT NULL,
    game_date              DATE NOT NULL,
    team_a_key             UUID NOT NULL,
    team_b_key             UUID NOT NULL,
    team_a_rating          DOUBLE PRECISION NOT NULL,
    team_b_rating          DOUBLE PRECISION NOT NULL,
    team_a_win_probability DOUBLE PRECISION NOT NULL,
    calculated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (season >= 2000),
    CHECK (team_a_rating > 0),
    CHECK (team_b_rating > 0),
    CHECK (team_a_win_probability > 0 AND team_a_win_probability < 1)
);

CREATE INDEX IF NOT EXISTS fct_game_predictions_season_idx
ON ohfootball_marts.fct_game_predictions (season);

CREATE INDEX IF NOT EXISTS fct_game_predictions_team_a_idx
ON ohfootball_marts.fct_game_predictions (team_a_key);

CREATE INDEX IF NOT EXISTS fct_game_predictions_team_b_idx
ON ohfootball_marts.fct_game_predictions (team_b_key);
