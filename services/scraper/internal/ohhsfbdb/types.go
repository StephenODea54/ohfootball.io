package ohhsfbdb

import "context"

// FirstSeason and LastSeason bound the backfill.
//
// The site holds seasons from 1972. The warehouse already holds the seasons
// from 2000, from another site, so this source supplies the seasons before
// that and no others. The bounds are constants because they describe the gap
// between two sources, not a choice that an operator makes at each run.
const (
	FirstSeason = 1972
	LastSeason  = 1999
)

// IndexEntry is one school of the index sheet.
//
// Name is the full name of the school, which the index alone holds. A team
// sheet holds a short name instead. Some names carry the years the school used
// them, as in "Akron Garfield (-2016)".
//
// Two entries may name one sheet. The index of the site holds one such pair,
// so a reader must not treat it as an error.
type IndexEntry struct {
	Position int
	Name     string
	Sheet    string
}

// SheetTeam is the school that owns one sheet.
//
// Number is the identifier that the other site gives the same school. It is
// empty for a school that closed before that site began, and the site holds a
// wrong digit on a few sheets, so a later layer corrects it. The scraper writes
// what the sheet says.
type SheetTeam struct {
	Sheet     string
	Number    string
	ShortName string
}

// GameRow is one row of the game log of one sheet.
//
// It is one team's view of one game, not a game. Two schools that played each
// other both list the game, so a consumer must combine the two rows.
//
// Every field except Season holds the text of the cell. The raw layer keeps
// what the sheet said, so a later layer can be corrected without another read
// of the site.
type GameRow struct {
	Sheet              string
	Season             int
	Week               string
	GameDate           string
	DayOfWeek          string
	HomeAway           string
	OpponentName       string
	OpponentSheet      string
	TeamScore          string
	OpponentScore      string
	Overtime           string
	Result             string
	OpponentConference string
	OpponentDivision   string
	OpponentRegion     string
	PlayoffRound       string
	TeamSeed           string
	OpponentSeed       string
	Stadium            string
	Location           string
}

// SeasonSummaryRow is one row of the season block of one sheet. That block sits
// beside the game log and holds one row for each season, so it does not line up
// with the game rows.
//
// It is the only place a sheet states the conference, the division, the region,
// and the rank of the school that owns the sheet. The game rows state those of
// the opponent.
type SeasonSummaryRow struct {
	Sheet            string
	Season           int
	Conference       string
	RegularWins      string
	RegularLosses    string
	RegularTies      string
	ConferenceWins   string
	ConferenceLosses string
	ConferenceTies   string
	PlayoffWins      string
	PlayoffLosses    string
	Division         string
	Region           string
	Rank             string
}

// Sink receives what the crawler read.
//
// WriteSheet is one unit of work. The store makes it one transaction, so a
// sheet is stored whole or not at all. A test supplies a sink that keeps the
// rows in memory.
type Sink interface {
	WriteIndex(ctx context.Context, entries []IndexEntry) error
	WriteSheet(ctx context.Context, team SheetTeam, games []GameRow, summaries []SeasonSummaryRow) error
}
