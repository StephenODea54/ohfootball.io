package store

import (
	"context"
	"fmt"

	"github.com/StephenODea54/pkg/database/db"
	"github.com/StephenODea54/services/scraper/internal/joeeitel"
	"github.com/jackc/pgx/v5/pgtype"
)

// RunSink writes the pages of one scrape run. It satisfies pipeline.Sink.
type RunSink struct {
	store *Store
	runID pgtype.UUID
}

// WriteTeam writes one team page: the team row and its schedule rows. Both go
// in one transaction, so a page reaches the database whole or not at all.
//
// The rows are appended, never updated. The raw tables hold one row for each
// run, and a later layer picks the run it wants.
func (r *RunSink) WriteTeam(ctx context.Context, team joeeitel.Team, rows []joeeitel.TeamScheduleRow) error {
	return r.store.withTx(ctx, func(queries *db.Queries) error {
		if err := queries.InsertTeam(ctx, teamParams(r.runID, team)); err != nil {
			return fmt.Errorf("insert team %d:%s: %w", team.Season, team.TeamID, err)
		}
		if len(rows) == 0 {
			return nil
		}
		if _, err := queries.AppendGames(ctx, gameParams(r.runID, rows)); err != nil {
			return fmt.Errorf("insert schedule of team %d:%s: %w", team.Season, team.TeamID, err)
		}
		return nil
	})
}

func teamParams(runID pgtype.UUID, team joeeitel.Team) db.InsertTeamParams {
	return db.InsertTeamParams{
		ScrapeRunID:    runID,
		Season:         int32(team.Season),
		TeamID:         team.TeamID,
		Name:           nullableText(team.Name),
		Mascot:         nullableText(team.Mascot),
		City:           nullableText(team.City),
		State:          nullableText(team.State),
		County:         nullableText(team.County),
		PrimaryColor:   nullableText(team.PrimaryColor),
		SecondaryColor: nullableText(team.SecondaryColor),
		Division:       nullableText(team.Division),
		Region:         nullableText(team.Region),
	}
}
