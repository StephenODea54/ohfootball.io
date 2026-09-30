-- Let the API read the games of one week quickly.
--
-- The API gives the rank of each team one week before a snapshot. It reads the
-- ratings that the teams carried into the games of that week from the
-- predictions. This index lets it find the games of one season in a range of
-- dates without a read of the whole table. The rating history reads one week
-- for each season of a program, so without the index it reads the table many
-- times.

CREATE INDEX IF NOT EXISTS fct_game_predictions_season_game_date_idx
ON ohfootball_marts.fct_game_predictions (season, game_date);
