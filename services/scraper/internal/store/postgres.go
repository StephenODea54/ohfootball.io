package store

import (
	"context"
	"fmt"

	"github.com/StephenODea54/pkg/database"
	"github.com/StephenODea54/pkg/database/db"
	"github.com/StephenODea54/services/scraper/internal/joeeitel"
	"github.com/jackc/pgx/v5/pgtype"
)

type Postgres struct {
	*database.Client
}

func Open(ctx context.Context, databaseURL string) (*Postgres, error) {
	client, err := database.Open(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	return &Postgres{Client: client}, nil
}

func (postgres *Postgres) StartRun(ctx context.Context, scraperVersion, rootURL string) (pgtype.UUID, error) {
	runID, err := postgres.StartScrapeRun(ctx, db.StartScrapeRunParams{
		ScraperVersion: scraperVersion,
		RootUrl:        rootURL,
	})
	if err != nil {
		return pgtype.UUID{}, fmt.Errorf("start scrape run: %w", err)
	}
	return runID, nil
}

func (postgres *Postgres) SuccessfulSeasons(ctx context.Context, startSeason, endSeason int) (map[int]struct{}, error) {
	seasons, err := postgres.ListSuccessfulSeasons(ctx, db.ListSuccessfulSeasonsParams{
		StartSeason: int32(startSeason),
		EndSeason:   int32(endSeason),
	})
	if err != nil {
		return nil, fmt.Errorf("list successful seasons: %w", err)
	}

	loaded := make(map[int]struct{}, len(seasons))
	for _, season := range seasons {
		loaded[int(season)] = struct{}{}
	}
	return loaded, nil
}

func (postgres *Postgres) Append(ctx context.Context, runID pgtype.UUID, teams []joeeitel.Team, games []joeeitel.TeamScheduleRow) error {
	transaction, err := postgres.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin raw append: %w", err)
	}
	defer transaction.Rollback(ctx)
	queries := postgres.WithTx(transaction)

	teamRows := make([]db.AppendTeamsParams, 0, len(teams))
	for _, team := range teams {
		teamRows = append(teamRows, db.AppendTeamsParams{
			ScrapeRunID:    runID,
			Season:         int32(team.Season),
			TeamID:         team.TeamID,
			Name:           nullable(team.Name),
			Mascot:         nullable(team.Mascot),
			City:           nullable(team.City),
			State:          nullable(team.State),
			County:         nullable(team.County),
			PrimaryColor:   nullable(team.PrimaryColor),
			SecondaryColor: nullable(team.SecondaryColor),
			Division:       nullable(team.Division),
			Region:         nullable(team.Region),
		})
	}
	if len(teamRows) > 0 {
		if _, err := queries.AppendTeams(ctx, teamRows); err != nil {
			return fmt.Errorf("append raw teams: %w", err)
		}
	}

	gameRows := make([]db.AppendGamesParams, 0, len(games))
	for _, game := range games {
		gameRows = append(gameRows, db.AppendGamesParams{
			ScrapeRunID:    runID,
			Season:         int32(game.Season),
			SourceTeamID:   nullable(game.SourceTeamID),
			GameDate:       nullable(game.GameDate),
			HomeAway:       nullable(game.HomeAway),
			OpponentTeamID: nullable(game.OpponentTeamID),
			Result:         nullable(game.Result),
			Score:          nullable(game.Score),
			Notes:          nullable(game.Notes),
			Playoff:        nullable(game.Playoff),
		})
	}
	if len(gameRows) > 0 {
		if _, err := queries.AppendGames(ctx, gameRows); err != nil {
			return fmt.Errorf("append raw games: %w", err)
		}
	}

	if err := transaction.Commit(ctx); err != nil {
		return fmt.Errorf("commit raw append: %w", err)
	}
	return nil
}

func (postgres *Postgres) FinishRun(ctx context.Context, runID pgtype.UUID, status string, runErr error) error {
	errorMessage := pgtype.Text{}
	if runErr != nil {
		errorMessage = nullable(runErr.Error())
	}
	if err := postgres.FinishScrapeRun(ctx, db.FinishScrapeRunParams{
		ID:           runID,
		Status:       status,
		ErrorMessage: errorMessage,
	}); err != nil {
		return fmt.Errorf("finish scrape run: %w", err)
	}
	return nil
}

func nullable(value string) pgtype.Text {
	return pgtype.Text{String: value, Valid: value != ""}
}
