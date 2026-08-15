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

-- name: InsertTeam :exec
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

-- name: InsertGames :copyfrom
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

-- name: InsertOhhsfbdbIndexEntries :copyfrom
INSERT INTO ohfootball_raw.ohhsfbdb_index (
    scrape_run_id,
    position,
    school_name,
    sheet
) VALUES (
    $1,
    $2,
    $3,
    $4
);

-- name: InsertOhhsfbdbTeam :exec
INSERT INTO ohfootball_raw.ohhsfbdb_teams (
    scrape_run_id,
    sheet,
    team_number,
    short_name
) VALUES (
    $1,
    $2,
    $3,
    $4
);

-- name: InsertOhhsfbdbGames :copyfrom
INSERT INTO ohfootball_raw.ohhsfbdb_games (
    scrape_run_id,
    sheet,
    season,
    week,
    game_date,
    day_of_week,
    home_away,
    opponent_name,
    opponent_sheet,
    team_score,
    opponent_score,
    overtime,
    result,
    opponent_conference,
    opponent_division,
    opponent_region,
    playoff_round,
    team_seed,
    opponent_seed,
    stadium,
    location
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
    $12,
    $13,
    $14,
    $15,
    $16,
    $17,
    $18,
    $19,
    $20,
    $21
);

-- name: InsertOhhsfbdbSeasonSummaries :copyfrom
INSERT INTO ohfootball_raw.ohhsfbdb_season_summaries (
    scrape_run_id,
    sheet,
    season,
    conference,
    regular_wins,
    regular_losses,
    regular_ties,
    conference_wins,
    conference_losses,
    conference_ties,
    playoff_wins,
    playoff_losses,
    division,
    region,
    rank
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
    $12,
    $13,
    $14,
    $15
);

-- name: FinishScrapeRun :exec
UPDATE ohfootball_metadata.scrape_runs
SET finished_at = NOW(),
    status = $2,
    error_message = $3
WHERE id = $1;
