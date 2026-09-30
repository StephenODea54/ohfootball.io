-- Drop the Elo rating and require the margin of each prediction.
--
-- The rating job now writes the margin rating to fct_team_ratings, and the API
-- reads it there. Nothing reads fct_team_elo_ratings any longer. The public
-- dataset kept the Elo ratings in the versions published before the change.
--
-- Each run of the rating job replaces every row of fct_game_predictions and
-- writes the margin and the date of each prediction. A row without them comes
-- from before the margin rating, and the next run writes it again. The rows
-- are deleted first, so the two columns can then refuse a missing value in any
-- order of deploy.

DELETE FROM ohfootball_marts.fct_game_predictions
WHERE predicted_margin IS NULL OR as_of_date IS NULL;

ALTER TABLE ohfootball_marts.fct_game_predictions
    ALTER COLUMN predicted_margin SET NOT NULL;

ALTER TABLE ohfootball_marts.fct_game_predictions
    ALTER COLUMN as_of_date SET NOT NULL;

DROP TABLE IF EXISTS ohfootball_marts.fct_team_elo_ratings;
