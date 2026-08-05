-- name: StartScrapeRun :one
INSERT INTO ohfootball_metadata.scrape_runs (
    scraper_version,
    root_url,
    status
) VALUES (
    $1,
    $2,
    'running'
)
RETURNING id;

-- name: AppendTeams :copyfrom
INSERT INTO ohfootball_raw.teams (
    scrape_run_id,
    season,
    team_id,
    name,
    mascot,
    city,
    state,
    county,
    primary_color,
    secondary_color,
    division,
    region
) VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8,
    $9,
    $10,
    $11,
    $12
);

-- name: AppendGames :copyfrom
INSERT INTO ohfootball_raw.games (
    scrape_run_id,
    season,
    source_team_id,
    game_date,
    home_away,
    opponent_team_id,
    result,
    score,
    notes,
    playoff
) VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8,
    $9,
    $10
);

-- name: FinishScrapeRun :exec
UPDATE ohfootball_metadata.scrape_runs
SET finished_at = NOW(),
    status = $2,
    error_message = $3
WHERE id = $1;

-- name: ListSuccessfulSeasons :many
SELECT DISTINCT teams.season
FROM ohfootball_raw.teams AS teams
INNER JOIN ohfootball_metadata.scrape_runs AS runs
    ON runs.id = teams.scrape_run_id
WHERE runs.status = 'succeeded'
  AND teams.season BETWEEN sqlc.arg(start_season) AND sqlc.arg(end_season)
ORDER BY teams.season;
