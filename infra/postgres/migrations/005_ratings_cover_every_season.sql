-- Let the ratings cover every season the warehouse holds.
--
-- Both rating tables were written when the warehouse began at the season of
-- 2000, because the site it read began there. A second site supplies the
-- seasons from 1972, and the ratings now read the whole record, so the rule
-- that named 2000 would refuse every row of those seasons.
--
-- The first season of the warehouse is 1972. The bound stays, because a season
-- outside the record still means a fault upstream.

ALTER TABLE ohfootball_marts.fct_team_elo_ratings
    DROP CONSTRAINT IF EXISTS fct_team_elo_ratings_season_check;

ALTER TABLE ohfootball_marts.fct_team_elo_ratings
    ADD CONSTRAINT fct_team_elo_ratings_season_check CHECK (season >= 1972);

ALTER TABLE ohfootball_marts.fct_game_predictions
    DROP CONSTRAINT IF EXISTS fct_game_predictions_season_check;

ALTER TABLE ohfootball_marts.fct_game_predictions
    ADD CONSTRAINT fct_game_predictions_season_check CHECK (season >= 1972);
