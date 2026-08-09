package joeeitel

type TeamRef struct {
	Season int
	TeamID string
	Name   string
	URL    string
}

func (t TeamRef) Key() string {
	return teamKey(t.Season, t.TeamID)
}

type Team struct {
	Season         int
	TeamID         string
	Name           string
	Mascot         string
	City           string
	State          string
	County         string
	PrimaryColor   string
	SecondaryColor string
	Division       string
	Region         string
}

// TeamScheduleRow holds one team's view of one game, as its own schedule page
// shows it. It is not a game. When two OHSAA teams play each other, the
// crawler reads both schedules and writes two rows for that game. A consumer
// that counts games must combine the rows on season, date, and the two team
// identifiers.
type TeamScheduleRow struct {
	Season         int
	SourceTeamID   string
	GameDate       string
	HomeAway       string
	OpponentTeamID string
	Result         string
	Score          string
	Notes          string
	Playoff        string
}

type Result struct {
	Season              int
	RegionCount         int
	OHSAATeams          []Team
	OpponentTeams       []Team
	Games               []TeamScheduleRow
	DiscoveredOpponents int
	Errors              []error
}

func (r Result) Teams() []Team {
	teams := make([]Team, 0, len(r.OHSAATeams)+len(r.OpponentTeams))
	teams = append(teams, r.OHSAATeams...)
	teams = append(teams, r.OpponentTeams...)
	return teams
}
