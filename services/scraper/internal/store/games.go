package store

import (
	"github.com/StephenODea54/pkg/database/db"
	"github.com/StephenODea54/services/scraper/internal/joeeitel"
	"github.com/jackc/pgx/v5/pgtype"
)

// gameParams maps the schedule rows of one team page onto the bulk insert. One
// team page holds about ten rows, so one bulk call covers a whole page.
func gameParams(runID pgtype.UUID, rows []joeeitel.TeamScheduleRow) []db.InsertGamesParams {
	params := make([]db.InsertGamesParams, 0, len(rows))
	for _, row := range rows {
		params = append(params, db.InsertGamesParams{
			ScrapeRunID:    runID,
			Season:         int32(row.Season),
			SourceTeamID:   nullableText(row.SourceTeamID),
			GameDate:       nullableText(row.GameDate),
			HomeAway:       nullableText(row.HomeAway),
			OpponentTeamID: nullableText(row.OpponentTeamID),
			Result:         nullableText(row.Result),
			Score:          nullableText(row.Score),
			Notes:          nullableText(row.Notes),
			Playoff:        nullableText(row.Playoff),
		})
	}
	return params
}
