-- Make room for the margin rating.
--
-- The margin rating gives each team a number of points. A team below the
-- median has a negative rating, so the rules that ask a rating to be greater
-- than zero would refuse half of the rows. The model also predicts the score
-- margin of each game, and it stores a prediction for games not yet played,
-- dated the day that the prediction was made.
--
-- The new table holds one rating per team and snapshot. The relative rating is
-- the rating minus the median rating of the Ohio teams in the same snapshot, so
-- that 0 is the median team. The Elo table stays until nothing reads it.
--
-- The new columns of the predictions allow NULL for now, because the code that
-- runs before the margin rating writes rows without them.

CREATE TABLE IF NOT EXISTS ohfootball_marts.fct_team_ratings (
    team_key        UUID NOT NULL,
    season          SMALLINT NOT NULL,
    as_of_date      DATE NOT NULL,
    rating          DOUBLE PRECISION NOT NULL,
    relative_rating DOUBLE PRECISION NOT NULL,
    calculated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_key, as_of_date),
    CHECK (season >= 1972)
);

CREATE INDEX IF NOT EXISTS fct_team_ratings_season_snapshot_idx
ON ohfootball_marts.fct_team_ratings (
    season,
    as_of_date DESC,
    rating DESC
);

ALTER TABLE ohfootball_marts.fct_game_predictions
    DROP CONSTRAINT IF EXISTS fct_game_predictions_team_a_rating_check;

ALTER TABLE ohfootball_marts.fct_game_predictions
    DROP CONSTRAINT IF EXISTS fct_game_predictions_team_b_rating_check;

ALTER TABLE ohfootball_marts.fct_game_predictions
    ADD COLUMN IF NOT EXISTS predicted_margin DOUBLE PRECISION;

ALTER TABLE ohfootball_marts.fct_game_predictions
    ADD COLUMN IF NOT EXISTS as_of_date DATE;
