package store

import (
	"strings"
	"testing"
	"time"
)

// The functions below do in Go what the SQL of week.go does, with the same constants. The tests
// check the rule on real calendar dates through them, and check that the SQL is built from the
// same constants, so a change to one constant changes both.

// weekStartOf is weekStartSQL: the Monday of the date two days before.
func weekStartOf(day time.Time) time.Time {
	shifted := day.AddDate(0, 0, -weekStartDaysBack)
	daysSinceMonday := (int(shifted.Weekday()) + 6) % 7
	return shifted.AddDate(0, 0, -daysSinceMonday)
}

type scheduledGame struct {
	day  time.Time
	ohio bool
}

// seasonStartOf is seasonStartsCTE for one season.
func seasonStartOf(games []scheduledGame) time.Time {
	ohioGames := make(map[time.Time]int)
	var first, firstLarge time.Time
	for _, game := range games {
		start := weekStartOf(game.day)
		if game.ohio {
			ohioGames[start]++
		}
		if first.IsZero() || start.Before(first) {
			first = start
		}
	}
	for start, count := range ohioGames {
		if count >= seasonStartOhioGames && (firstLarge.IsZero() || start.Before(firstLarge)) {
			firstLarge = start
		}
	}
	if firstLarge.IsZero() {
		return first
	}
	return firstLarge
}

// weekNumberOf is weekNumberSQL. The two dates are Mondays, so the days between them are a
// multiple of 7.
func weekNumberOf(day, seasonStart time.Time) int {
	days := int(weekStartOf(day).Sub(seasonStart).Hours() / 24)
	return max(firstWeek, days/7+1)
}

func date(month time.Month, day int) time.Time {
	return time.Date(2025, month, day, 0, 0, 0, 0, time.UTC)
}

// games gives count games on day.
func games(day time.Time, count int, ohio bool) []scheduledGame {
	result := make([]scheduledGame, count)
	for index := range result {
		result[index] = scheduledGame{day: day, ohio: ohio}
	}
	return result
}

func TestAWeekRunsFromWednesdayToTuesday(t *testing.T) {
	seasonStart := weekStartOf(date(time.August, 21))
	cases := []struct {
		day  time.Time
		week int
	}{
		{date(time.August, 20), 1}, // Wednesday
		{date(time.August, 21), 1}, // Thursday
		{date(time.August, 22), 1}, // Friday
		{date(time.August, 23), 1}, // Saturday
		{date(time.August, 25), 1}, // a makeup game on the Monday
		{date(time.August, 26), 1}, // Tuesday
		{date(time.August, 27), 2}, // Wednesday of the next week
		{date(time.October, 24), 10},
		{date(time.December, 6), 16},
	}
	for _, testCase := range cases {
		if got := weekNumberOf(testCase.day, seasonStart); got != testCase.week {
			t.Errorf("%s (%s) is in week %d, want %d",
				testCase.day.Format(time.DateOnly), testCase.day.Weekday(), got, testCase.week)
		}
	}
	if seasonStart.Weekday() != time.Monday {
		t.Fatalf("the week start is a %s, want the Monday that SQL gives", seasonStart.Weekday())
	}
}

func TestWeekOneIsTheFirstWeekWithManyOhioGames(t *testing.T) {
	// A few out-of-state games a week before the season starts.
	season := games(date(time.August, 15), 14, false)
	season = append(season, games(date(time.August, 16), 2, true)...)
	season = append(season, games(date(time.August, 22), seasonStartOhioGames, true)...)
	season = append(season, games(date(time.August, 29), 300, true)...)

	start := seasonStartOf(season)
	if !start.Equal(weekStartOf(date(time.August, 22))) {
		t.Fatalf("the season starts on %s, want the week of August 22", start.Format(time.DateOnly))
	}
	if week := weekNumberOf(date(time.August, 15), start); week != 1 {
		t.Fatalf("an early game is in week %d, want week 1", week)
	}
	if week := weekNumberOf(date(time.August, 29), start); week != 2 {
		t.Fatalf("the week after the start is week %d, want week 2", week)
	}
}

func TestASeasonWithNoLargeWeekStartsAtItsFirstGame(t *testing.T) {
	season := append(games(date(time.August, 29), 30, true), games(date(time.August, 22), 3, false)...)
	if start := seasonStartOf(season); !start.Equal(weekStartOf(date(time.August, 22))) {
		t.Fatalf("the season starts on %s, want the week of its first game", start.Format(time.DateOnly))
	}
}

func TestTheSQLOfTheWeekIsBuiltFromTheSameConstants(t *testing.T) {
	if weekStartSQL != "DATE_TRUNC('week', date.date_day - 2)::date" {
		t.Fatalf("weekStartSQL = %q, want the Monday of the date two days before", weekStartSQL)
	}
	if weekNumberSQL != "GREATEST(1, ("+weekStartSQL+" - season_starts.week_start) / 7 + 1)::int" {
		t.Fatalf("weekNumberSQL = %q, want the weeks since week 1, plus 1, and at least 1", weekNumberSQL)
	}
	for _, part := range []string{
		"MIN(week_start) FILTER (WHERE ohio_games >= 50)",
		"team_a.state_code = 'OH' AND team_b.state_code = 'OH'",
		"WHERE game.is_current",
		"GROUP BY game.season, week_start",
	} {
		if !strings.Contains(seasonStartsCTE, part) {
			t.Errorf("seasonStartsCTE does not hold %q", part)
		}
	}
	if strings.Contains(seasonStartsCTE, "result") {
		t.Error("seasonStartsCTE reads the result, so a season without results would start late")
	}
}
