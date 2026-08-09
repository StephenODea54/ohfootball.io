package joeeitel

import (
	"net/url"
	"testing"
)

func mustParseURL(t *testing.T, raw string) *url.URL {
	t.Helper()
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse %q: %v", raw, err)
	}
	return parsed
}

func TestSeasonIndexURLKeepsTheTrailingSlash(t *testing.T) {
	for _, base := range []string{"https://joeeitel.com", "https://joeeitel.com/"} {
		if got := SeasonIndexURL(base); got != "https://joeeitel.com/hsfoot/" {
			t.Errorf("SeasonIndexURL(%q) is %q", base, got)
		}
	}
}

// The season links on the index page are relative. They only resolve to the
// right path when the base keeps its trailing slash.
func TestSeasonIndexURLResolvesARelativeSeasonLink(t *testing.T) {
	base := mustParseURL(t, SeasonIndexURL("https://joeeitel.com"))
	resolved, err := resolveURL(base, "seasons.jsp?year=2014")
	if err != nil {
		t.Fatalf("resolveURL returned %v", err)
	}
	if resolved.Path != "/hsfoot/seasons.jsp" {
		t.Errorf("path is %q, want %q", resolved.Path, "/hsfoot/seasons.jsp")
	}
}

func TestSeasonURL(t *testing.T) {
	want := "https://joeeitel.com/hsfoot/seasons.jsp?year=2014"
	for _, base := range []string{"https://joeeitel.com", "https://joeeitel.com/"} {
		if got := SeasonURL(base, 2014); got != want {
			t.Errorf("SeasonURL(%q, 2014) is %q, want %q", base, got, want)
		}
	}
}

func TestParseTeamRef(t *testing.T) {
	base := mustParseURL(t, "https://joeeitel.com/hsfoot/rankings/2025/region-1.jsp")

	tests := []struct {
		name    string
		href    string
		season  int
		refName string
		wantOK  bool
		wantURL string
		wantID  string
	}{
		{
			name:    "relative link",
			href:    "teams.jsp?teamID=483",
			season:  2025,
			refName: "  Massillon  Washington ",
			wantOK:  true,
			wantID:  "483",
			wantURL: "https://joeeitel.com/hsfoot/teams.jsp?teamID=483&year=2025",
		},
		{
			name:    "absolute link on www and http",
			href:    "http://www.joeeitel.com/hsfoot/teams.jsp?teamID=12&year=2025",
			season:  2025,
			wantOK:  true,
			wantID:  "12",
			wantURL: "https://joeeitel.com/hsfoot/teams.jsp?teamID=12&year=2025",
		},
		{
			name:    "the season of the run replaces the year in the link",
			href:    "https://joeeitel.com/hsfoot/teams.jsp?teamID=99&year=2019",
			season:  2025,
			wantOK:  true,
			wantID:  "99",
			wantURL: "https://joeeitel.com/hsfoot/teams.jsp?teamID=99&year=2025",
		},
		{
			name:   "a fragment is dropped",
			href:   "teams.jsp?teamID=7#schedule",
			season: 2025,
			wantOK: true,
			wantID: "7",

			wantURL: "https://joeeitel.com/hsfoot/teams.jsp?teamID=7&year=2025",
		},
		{
			name:   "another host is rejected",
			href:   "https://example.com/hsfoot/teams.jsp?teamID=1",
			season: 2025,
		},
		{
			name:   "another path is rejected",
			href:   "rankings/region-2.jsp?teamID=1",
			season: 2025,
		},
		{
			name:   "a missing teamID is rejected",
			href:   "teams.jsp?year=2025",
			season: 2025,
		},
		{
			name:   "an unparseable link is rejected",
			href:   "://no-scheme",
			season: 2025,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			ref, ok := ParseTeamRef(base, test.href, test.season, test.refName)
			if ok != test.wantOK {
				t.Fatalf("ParseTeamRef returned ok=%v, want %v", ok, test.wantOK)
			}
			if !test.wantOK {
				return
			}
			if ref.URL != test.wantURL {
				t.Errorf("URL is %q, want %q", ref.URL, test.wantURL)
			}
			if ref.TeamID != test.wantID {
				t.Errorf("TeamID is %q, want %q", ref.TeamID, test.wantID)
			}
			if ref.Season != test.season {
				t.Errorf("Season is %d, want %d", ref.Season, test.season)
			}
		})
	}
}

func TestParseTeamRefCleansTheName(t *testing.T) {
	base := mustParseURL(t, "https://joeeitel.com/hsfoot/rankings/2025/region-1.jsp")
	ref, ok := ParseTeamRef(base, "teams.jsp?teamID=1", 2025, "  Massillon\n Washington  ")
	if !ok {
		t.Fatal("ParseTeamRef rejected a valid link")
	}
	if ref.Name != "Massillon Washington" {
		t.Errorf("Name is %q, want %q", ref.Name, "Massillon Washington")
	}
}

func TestCanonicalHostLeavesOtherHostsAlone(t *testing.T) {
	other := mustParseURL(t, "http://www.example.com/page")
	canonicalHost(other)
	if other.String() != "http://www.example.com/page" {
		t.Errorf("canonicalHost changed %q", other.String())
	}
}

func TestSameHostIgnoresTheWWWPrefixAndTheCase(t *testing.T) {
	tests := []struct {
		a, b string
		want bool
	}{
		{"https://joeeitel.com/a", "http://www.JoeEitel.com/b", true},
		{"https://joeeitel.com/a", "https://example.com/b", false},
		{"/relative", "https://joeeitel.com/b", false},
	}
	for _, test := range tests {
		got := sameHost(mustParseURL(t, test.a), mustParseURL(t, test.b))
		if got != test.want {
			t.Errorf("sameHost(%q, %q) is %v, want %v", test.a, test.b, got, test.want)
		}
	}
}
