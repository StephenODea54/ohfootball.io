package ohhsfbdb

import (
	"context"
	"fmt"

	"github.com/StephenODea54/services/scraper/internal/pipeline"
)

// Getter fetches one page. The fetch package satisfies it. A test satisfies it
// with saved pages, so the runner tests make no network request.
type Getter interface {
	Get(ctx context.Context, url string) ([]byte, error)
}

// Runner reads the whole workbook.
type Runner struct {
	Client  Getter
	Workers int
	BaseURL string
}

// Summary counts what one run stored. It holds no error field, because any
// error stops the run, so a Summary always describes a complete run.
type Summary struct {
	IndexEntries     int
	Sheets           int
	SheetsWithNumber int
	GameRows         int
	SummaryRows      int
}

// sheetResult is what one worker reports back.
type sheetResult struct {
	hasNumber bool
	games     int
	summaries int
}

// Run reads the index, then every sheet, and writes them through sink.
//
// Any error stops the run. The sheets that were already written stay in the
// database, and the caller marks the run failed. The whole read takes a few
// minutes, so a failed run is repaired by running it again rather than by
// carrying the machinery to continue a part-finished one.
//
// One sheet holds every season, so the run keeps the seasons of the backfill
// and drops the rest. That choice belongs here. The parser stays a faithful
// reader of a page, and the store stays a writer that asks no questions.
func (r *Runner) Run(ctx context.Context, sink Sink) (Summary, error) {
	entries, err := r.readIndex(ctx)
	if err != nil {
		return Summary{}, err
	}
	if err := sink.WriteIndex(ctx, entries); err != nil {
		return Summary{}, fmt.Errorf("write the index: %w", err)
	}

	sheets := Sheets(entries)
	results, err := pipeline.FanOut(ctx, r.Workers, sheets,
		func(ctx context.Context, sheet string) (sheetResult, error) {
			return r.writeSheet(ctx, sheet, sink)
		})
	if err != nil {
		return Summary{}, err
	}

	summary := Summary{IndexEntries: len(entries), Sheets: len(sheets)}
	for _, result := range results {
		if result.hasNumber {
			summary.SheetsWithNumber++
		}
		summary.GameRows += result.games
		summary.SummaryRows += result.summaries
	}
	return summary, nil
}

// readIndex reads the sheet that lists every school.
func (r *Runner) readIndex(ctx context.Context) ([]IndexEntry, error) {
	indexURL := IndexURL(r.BaseURL)
	body, err := r.Client.Get(ctx, indexURL)
	if err != nil {
		return nil, fmt.Errorf("fetch the index %s: %w", indexURL, err)
	}
	doc, _, err := newDocument(body, indexURL)
	if err != nil {
		return nil, err
	}

	entries, err := ParseIndex(doc)
	if err != nil {
		return nil, fmt.Errorf("read the index %s: %w", indexURL, err)
	}
	return entries, nil
}

// writeSheet reads one sheet and hands the seasons of the backfill to the sink.
//
// The school is written even when no season of the backfill remains, because
// that row names the school of the sheet, and the games of other schools point
// at this sheet.
func (r *Runner) writeSheet(ctx context.Context, sheet string, sink Sink) (sheetResult, error) {
	sheetURL := SheetURL(r.BaseURL, sheet)
	body, err := r.Client.Get(ctx, sheetURL)
	if err != nil {
		return sheetResult{}, fmt.Errorf("fetch sheet %s: %w", sheet, err)
	}
	doc, _, err := newDocument(body, sheetURL)
	if err != nil {
		return sheetResult{}, err
	}

	team, games, summaries, err := ParseSheet(doc, sheet)
	if err != nil {
		return sheetResult{}, err
	}

	games = gamesInRange(games)
	summaries = summariesInRange(summaries)
	if err := sink.WriteSheet(ctx, team, games, summaries); err != nil {
		return sheetResult{}, fmt.Errorf("write sheet %s: %w", sheet, err)
	}
	return sheetResult{
		hasNumber: team.Number != "",
		games:     len(games),
		summaries: len(summaries),
	}, nil
}

// inRange reports whether a season belongs to the backfill.
func inRange(season int) bool {
	return season >= FirstSeason && season <= LastSeason
}

func gamesInRange(rows []GameRow) []GameRow {
	kept := make([]GameRow, 0, len(rows))
	for _, row := range rows {
		if inRange(row.Season) {
			kept = append(kept, row)
		}
	}
	return kept
}

func summariesInRange(rows []SeasonSummaryRow) []SeasonSummaryRow {
	kept := make([]SeasonSummaryRow, 0, len(rows))
	for _, row := range rows {
		if inRange(row.Season) {
			kept = append(kept, row)
		}
	}
	return kept
}
