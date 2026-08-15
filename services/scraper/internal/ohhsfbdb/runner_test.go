package ohhsfbdb

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
)

// pages answers with saved bodies, and counts what was asked for.
type pages struct {
	mu     sync.Mutex
	bodies map[string][]byte
	calls  map[string]int
	fail   error
}

func (p *pages) Get(ctx context.Context, url string) ([]byte, error) {
	// The real client waits on a rate limiter, which returns this error first.
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.calls[url]++
	if p.fail != nil {
		return nil, p.fail
	}
	body, ok := p.bodies[url]
	if !ok {
		return nil, errors.New("no saved page for " + url)
	}
	return body, nil
}

// recorder keeps what the runner wrote.
type recorder struct {
	mu        sync.Mutex
	indexes   [][]IndexEntry
	teams     []SheetTeam
	games     []GameRow
	summaries []SeasonSummaryRow
	failWrite error
	failIndex error
}

func (r *recorder) WriteIndex(_ context.Context, entries []IndexEntry) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.failIndex != nil {
		return r.failIndex
	}
	r.indexes = append(r.indexes, entries)
	return nil
}

func (r *recorder) WriteSheet(
	_ context.Context, team SheetTeam, games []GameRow, summaries []SeasonSummaryRow,
) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.failWrite != nil {
		return r.failWrite
	}
	r.teams = append(r.teams, team)
	r.games = append(r.games, games...)
	r.summaries = append(r.summaries, summaries...)
	return nil
}

const testBase = "https://ohhsfbdb.test"

// newRunner builds a runner over saved pages. Every sheet of the index answers
// with the saved Ada sheet unless the caller replaced it.
func newRunner(t *testing.T, replace map[string][]byte) (*Runner, *pages, *recorder) {
	t.Helper()
	index := fixture(t, "index.htm")
	ada := fixture(t, "sheet_ada.htm")

	bodies := map[string][]byte{IndexURL(testBase): index}
	doc, _, err := NewDocument(index, IndexURL(testBase))
	if err != nil {
		t.Fatalf("parse the index: %v", err)
	}
	entries, err := ParseIndex(doc)
	if err != nil {
		t.Fatalf("read the index: %v", err)
	}
	for _, sheet := range Sheets(entries) {
		bodies[SheetURL(testBase, sheet)] = ada
	}
	for url, body := range replace {
		bodies[url] = body
	}

	client := &pages{bodies: bodies, calls: map[string]int{}}
	return &Runner{Client: client, Workers: 2, BaseURL: testBase}, client, &recorder{}
}

func TestRunWritesTheIndexOnceAndEachSheetOnce(t *testing.T) {
	runner, client, sink := newRunner(t, nil)

	summary, err := runner.Run(context.Background(), sink)
	if err != nil {
		t.Fatalf("Run returned %v", err)
	}

	if len(sink.indexes) != 1 {
		t.Fatalf("the index was written %d times, want 1", len(sink.indexes))
	}
	if summary.IndexEntries <= summary.Sheets {
		t.Errorf("the index holds %d entries and %d sheets, want more entries than sheets",
			summary.IndexEntries, summary.Sheets)
	}
	if len(sink.teams) != summary.Sheets {
		t.Errorf("%d sheets were written, want %d", len(sink.teams), summary.Sheets)
	}

	// The index names one sheet twice. The runner reads it once.
	for url, count := range client.calls {
		if count != 1 {
			t.Errorf("%s was fetched %d times, want 1", url, count)
		}
	}
}

func TestRunKeepsOnlyTheSeasonsOfTheBackfill(t *testing.T) {
	runner, _, sink := newRunner(t, nil)

	if _, err := runner.Run(context.Background(), sink); err != nil {
		t.Fatalf("Run returned %v", err)
	}
	if len(sink.games) == 0 {
		t.Fatal("Run wrote no game")
	}
	for _, game := range sink.games {
		if game.Season < FirstSeason || game.Season > LastSeason {
			t.Fatalf("a game of season %d was written, want %d to %d",
				game.Season, FirstSeason, LastSeason)
		}
	}
	for _, summary := range sink.summaries {
		if summary.Season < FirstSeason || summary.Season > LastSeason {
			t.Fatalf("a season record of %d was written", summary.Season)
		}
	}
}

func TestRunWritesTheSchoolOfASheetWithNoSeasonOfTheBackfill(t *testing.T) {
	recent := buildSheet(
		[]string{"999", "Late Starter", "Main Table"}, headings(),
		gameCells("2015", "1", "8/28/15", "Fri", "H", "Ada", "7", "42", "", "L"),
	)
	runner, client, sink := newRunner(t, nil)
	for url := range client.bodies {
		if url != IndexURL(testBase) {
			client.bodies[url] = []byte(recent)
		}
	}

	summary, err := runner.Run(context.Background(), sink)
	if err != nil {
		t.Fatalf("Run returned %v", err)
	}
	if summary.GameRows != 0 {
		t.Errorf("Run wrote %d games, want 0", summary.GameRows)
	}
	if len(sink.teams) != summary.Sheets || summary.Sheets == 0 {
		t.Errorf("%d schools were written for %d sheets", len(sink.teams), summary.Sheets)
	}
}

func TestRunCountsTheSheetsThatNameAnIdentifier(t *testing.T) {
	runner, _, sink := newRunner(t, nil)
	summary, err := runner.Run(context.Background(), sink)
	if err != nil {
		t.Fatalf("Run returned %v", err)
	}
	if summary.SheetsWithNumber != summary.Sheets {
		t.Errorf("%d sheets of %d name an identifier, want all of them",
			summary.SheetsWithNumber, summary.Sheets)
	}

	noNumber := buildSheet(
		[]string{"", "Cathedral Latin", "Main Table"}, headings(),
		gameCells("1974", "1", "9/6/74", "Fri", "H", "Ada", "6", "20", "", "L"),
	)
	runner, client, sink := newRunner(t, nil)
	for url := range client.bodies {
		if url != IndexURL(testBase) {
			client.bodies[url] = []byte(noNumber)
		}
	}
	summary, err = runner.Run(context.Background(), sink)
	if err != nil {
		t.Fatalf("Run returned %v", err)
	}
	if summary.SheetsWithNumber != 0 {
		t.Errorf("%d sheets name an identifier, want 0", summary.SheetsWithNumber)
	}
}

func TestRunStopsWhenTheIndexCannotBeRead(t *testing.T) {
	runner, client, sink := newRunner(t, nil)
	client.bodies[IndexURL(testBase)] = []byte("<html><body>no links</body></html>")

	_, err := runner.Run(context.Background(), sink)
	if !errors.Is(err, ErrEmptyIndex) {
		t.Fatalf("Run returned %v, want ErrEmptyIndex", err)
	}
	if len(sink.teams) != 0 {
		t.Error("Run wrote a sheet after it failed to read the index")
	}
}

func TestRunStopsWhenTheIndexCannotBeFetched(t *testing.T) {
	runner, client, sink := newRunner(t, nil)
	client.fail = errors.New("the network is down")

	if _, err := runner.Run(context.Background(), sink); err == nil {
		t.Fatal("Run returned no error when the index could not be fetched")
	}
}

func TestRunStopsWhenOneSheetCannotBeRead(t *testing.T) {
	runner, client, sink := newRunner(t, nil)
	for url := range client.bodies {
		if url != IndexURL(testBase) {
			client.bodies[url] = []byte(buildSheet([]string{"1", "Broken", "Main Table"}))
			break
		}
	}

	_, err := runner.Run(context.Background(), sink)
	if err == nil {
		t.Fatal("Run returned no error for a sheet it could not read")
	}
	if !strings.Contains(err.Error(), "column headings") {
		t.Errorf("error is %q, want it to name the headings", err)
	}
}

func TestRunStopsWhenTheSinkFails(t *testing.T) {
	runner, _, sink := newRunner(t, nil)
	sink.failWrite = errors.New("the database is gone")

	if _, err := runner.Run(context.Background(), sink); err == nil {
		t.Fatal("Run returned no error when the sink failed")
	}
}

func TestRunStopsWhenTheIndexCannotBeWritten(t *testing.T) {
	runner, _, sink := newRunner(t, nil)
	sink.failIndex = errors.New("the database is gone")

	_, err := runner.Run(context.Background(), sink)
	if err == nil {
		t.Fatal("Run returned no error when the index could not be written")
	}
	if len(sink.teams) != 0 {
		t.Error("Run read a sheet after it failed to write the index")
	}
}

func TestRunStopsWhenTheContextIsCancelled(t *testing.T) {
	runner, _, sink := newRunner(t, nil)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := runner.Run(ctx, sink); err == nil {
		t.Fatal("Run returned no error for a cancelled context")
	}
}
