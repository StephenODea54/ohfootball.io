package store

import (
	"context"
	"fmt"

	"github.com/StephenODea54/pkg/database/db"
	"github.com/StephenODea54/services/scraper/internal/ohhsfbdb"
	"github.com/jackc/pgx/v5/pgtype"
)

// OhhsfbdbSink writes the sheets of one backfill run. It satisfies
// ohhsfbdb.Sink.
type OhhsfbdbSink struct {
	store *Store
	runID pgtype.UUID
}

// ForOhhsfbdbRun binds a sink to one run, so the caller does not carry the run
// identifier through every stage.
func (s *Store) ForOhhsfbdbRun(runID pgtype.UUID) *OhhsfbdbSink {
	return &OhhsfbdbSink{store: s, runID: runID}
}

// WriteIndex writes the index sheet in one transaction.
//
// It keeps every row the site lists, including the two rows that name one
// sheet. The raw layer records what the site says.
func (o *OhhsfbdbSink) WriteIndex(ctx context.Context, entries []ohhsfbdb.IndexEntry) error {
	if len(entries) == 0 {
		return nil
	}
	return o.store.withTx(ctx, func(queries *db.Queries) error {
		params := make([]db.InsertOhhsfbdbIndexEntriesParams, 0, len(entries))
		for _, entry := range entries {
			params = append(params, db.InsertOhhsfbdbIndexEntriesParams{
				ScrapeRunID: o.runID,
				Position:    int32(entry.Position),
				SchoolName:  entry.Name,
				Sheet:       entry.Sheet,
			})
		}
		if _, err := queries.InsertOhhsfbdbIndexEntries(ctx, params); err != nil {
			return fmt.Errorf("insert the index: %w", err)
		}
		return nil
	})
}

// WriteSheet writes one sheet: the school, its games, and its season records.
// All of it goes in one transaction, so a sheet reaches the database whole or
// not at all.
//
// The school is written even when the caller kept no game from the sheet,
// because the row carries the identifier that a later layer needs to know which
// school the sheet belongs to.
func (o *OhhsfbdbSink) WriteSheet(
	ctx context.Context,
	team ohhsfbdb.SheetTeam,
	games []ohhsfbdb.GameRow,
	summaries []ohhsfbdb.SeasonSummaryRow,
) error {
	return o.store.withTx(ctx, func(queries *db.Queries) error {
		err := queries.InsertOhhsfbdbTeam(ctx, db.InsertOhhsfbdbTeamParams{
			ScrapeRunID: o.runID,
			Sheet:       team.Sheet,
			TeamNumber:  nullableText(team.Number),
			ShortName:   nullableText(team.ShortName),
		})
		if err != nil {
			return fmt.Errorf("insert the school of %s: %w", team.Sheet, err)
		}

		if len(games) > 0 {
			if _, err := queries.InsertOhhsfbdbGames(ctx, ohhsfbdbGameParams(o.runID, games)); err != nil {
				return fmt.Errorf("insert the games of %s: %w", team.Sheet, err)
			}
		}
		if len(summaries) > 0 {
			params := ohhsfbdbSummaryParams(o.runID, summaries)
			if _, err := queries.InsertOhhsfbdbSeasonSummaries(ctx, params); err != nil {
				return fmt.Errorf("insert the season records of %s: %w", team.Sheet, err)
			}
		}
		return nil
	})
}

func ohhsfbdbGameParams(runID pgtype.UUID, games []ohhsfbdb.GameRow) []db.InsertOhhsfbdbGamesParams {
	params := make([]db.InsertOhhsfbdbGamesParams, 0, len(games))
	for _, game := range games {
		params = append(params, db.InsertOhhsfbdbGamesParams{
			ScrapeRunID:        runID,
			Sheet:              game.Sheet,
			Season:             int32(game.Season),
			Week:               nullableText(game.Week),
			GameDate:           nullableText(game.GameDate),
			DayOfWeek:          nullableText(game.DayOfWeek),
			HomeAway:           nullableText(game.HomeAway),
			OpponentName:       nullableText(game.OpponentName),
			OpponentSheet:      nullableText(game.OpponentSheet),
			TeamScore:          nullableText(game.TeamScore),
			OpponentScore:      nullableText(game.OpponentScore),
			Overtime:           nullableText(game.Overtime),
			Result:             nullableText(game.Result),
			OpponentConference: nullableText(game.OpponentConference),
			OpponentDivision:   nullableText(game.OpponentDivision),
			OpponentRegion:     nullableText(game.OpponentRegion),
			PlayoffRound:       nullableText(game.PlayoffRound),
			TeamSeed:           nullableText(game.TeamSeed),
			OpponentSeed:       nullableText(game.OpponentSeed),
			Stadium:            nullableText(game.Stadium),
			Location:           nullableText(game.Location),
		})
	}
	return params
}

func ohhsfbdbSummaryParams(
	runID pgtype.UUID,
	summaries []ohhsfbdb.SeasonSummaryRow,
) []db.InsertOhhsfbdbSeasonSummariesParams {
	params := make([]db.InsertOhhsfbdbSeasonSummariesParams, 0, len(summaries))
	for _, summary := range summaries {
		params = append(params, db.InsertOhhsfbdbSeasonSummariesParams{
			ScrapeRunID:      runID,
			Sheet:            summary.Sheet,
			Season:           int32(summary.Season),
			Conference:       nullableText(summary.Conference),
			RegularWins:      nullableText(summary.RegularWins),
			RegularLosses:    nullableText(summary.RegularLosses),
			RegularTies:      nullableText(summary.RegularTies),
			ConferenceWins:   nullableText(summary.ConferenceWins),
			ConferenceLosses: nullableText(summary.ConferenceLosses),
			ConferenceTies:   nullableText(summary.ConferenceTies),
			PlayoffWins:      nullableText(summary.PlayoffWins),
			PlayoffLosses:    nullableText(summary.PlayoffLosses),
			Division:         nullableText(summary.Division),
			Region:           nullableText(summary.Region),
			Rank:             nullableText(summary.Rank),
		})
	}
	return params
}
