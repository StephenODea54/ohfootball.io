package guard

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/StephenODea54/services/api/internal/ratelimit"
)

const buildKey = "probe-build-key-123456"

type clock struct{ now time.Time }

func (clock *clock) read() time.Time            { return clock.now }
func (clock *clock) advance(step time.Duration) { clock.now = clock.now.Add(step) }

type fixture struct {
	guard *Guard
	clock *clock
	logs  *bytes.Buffer
}

func newFixture(t *testing.T, limits ratelimit.Limits, key string) fixture {
	t.Helper()
	clock := &clock{now: time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)}
	logs := &bytes.Buffer{}
	guard, err := New(Config{
		Limits:   limits,
		BuildKey: key,
		Logger:   slog.New(slog.NewTextHandler(logs, nil)),
		Now:      clock.read,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return fixture{guard: guard, clock: clock, logs: logs}
}

// ok answers 200, so a test can tell a request that passed the guard.
var ok = http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
	writer.WriteHeader(http.StatusOK)
})

func request(headers map[string]string) *http.Request {
	request := httptest.NewRequest(http.MethodPost, "/graphql", nil)
	request.RemoteAddr = "192.0.2.10:5000"
	for name, value := range headers {
		request.Header.Set(name, value)
	}
	return request
}

func serve(handler http.Handler, request *http.Request) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

type decodedError struct {
	Errors []struct {
		Message    string            `json:"message"`
		Extensions map[string]string `json:"extensions"`
	} `json:"errors"`
}

func decodeError(t *testing.T, recorder *httptest.ResponseRecorder) (message, code string) {
	t.Helper()
	if contentType := recorder.Header().Get("Content-Type"); contentType != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", contentType)
	}
	var body decodedError
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil || len(body.Errors) != 1 {
		t.Fatalf("body %q is not one GraphQL error: %v", recorder.Body, err)
	}
	return body.Errors[0].Message, body.Errors[0].Extensions["code"]
}

func TestContact(t *testing.T) {
	cases := []struct {
		name, userAgent, from, want string
	}{
		{"email in the user agent", "my-football-app/1.0 (me@example.com)", "", "me@example.com"},
		{"url in the user agent", "bot/2 (+https://example.org/bot.html)", "", "https://example.org/bot.html"},
		{"http url", "bot/2 http://example.org", "", "http://example.org"},
		{"url with a port", "bot https://example.org:8443/a?b=c", "", "https://example.org:8443/a?b=c"},
		{"upper case", "BOT (ME@EXAMPLE.COM)", "", "ME@EXAMPLE.COM"},
		{"email in From", "Mozilla/5.0 (Macintosh)", "me@example.com", "me@example.com"},
		{"url in From", "", "https://example.org", "https://example.org"},
		{"the user agent comes first", "a (me@example.com)", "https://example.org", "me@example.com"},
		{"mailto in From", "", "mailto:me@example.com", "me@example.com"},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			got, found := Contact(testCase.userAgent, testCase.from)
			if !found || got != testCase.want {
				t.Fatalf("Contact = %q, %v, want %q, true", got, found, testCase.want)
			}
		})
	}
}

func TestContactRefusesHeadersWithoutOne(t *testing.T) {
	cases := []struct{ name, userAgent, from string }{
		{"empty", "", ""},
		{"white space", "   ", "\t"},
		{"curl", "curl/8.7.1", ""},
		{"a browser", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0", ""},
		{"python", "python-requests/2.32.3", ""},
		{"a url with no dot in the host", "bot http://localhost/x", ""},
		{"a url with no host", "bot https://", ""},
		{"an ftp url", "bot ftp://example.org", ""},
		{"an email with no domain", "bot me@", "me@example"},
		{"a bare domain", "bot example.org", "example.org"},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if got, found := Contact(testCase.userAgent, testCase.from); found {
				t.Fatalf("Contact = %q, want none", got)
			}
		})
	}
}

func TestContactIsCut(t *testing.T) {
	long := "https://example.org/" + strings.Repeat("a", 500)
	got, found := Contact(long, "")
	if !found || len(got) != maxContact || !strings.HasPrefix(long, got) {
		t.Fatalf("Contact returned %d bytes, want the first %d", len(got), maxContact)
	}
}

func TestClientKey(t *testing.T) {
	cases := []struct {
		name, realIP, remote, want string
	}{
		{"the header of the proxy", "203.0.113.7", "10.0.1.5:4000", "203.0.113.7"},
		{"white space around the header", " 203.0.113.7 ", "10.0.1.5:4000", "203.0.113.7"},
		{"no header", "", "192.0.2.10:5000", "192.0.2.10"},
		{"a header that is not an address", "203.0.113.7, 10.0.0.1", "192.0.2.10:5000", "192.0.2.10"},
		{"a connection with no port", "", "192.0.2.10", "192.0.2.10"},
		{"IPv6 shares its /64", "2001:db8:1:2:3:4:5:6", "", "2001:db8:1:2::/64"},
		{"IPv6 connection", "", "[2001:db8:1:2::9]:443", "2001:db8:1:2::/64"},
		{"IPv6 with a zone", "fe80::1%eth0", "", "fe80::/64"},
		{"IPv4 in IPv6", "::ffff:192.0.2.1", "", "192.0.2.1"},
		{"no address", "", "not an address", "unknown"},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/", nil)
			request.RemoteAddr = testCase.remote
			if testCase.realIP != "" {
				request.Header.Set(RealIPHeader, testCase.realIP)
			}
			if got := ClientKey(request); got != testCase.want {
				t.Fatalf("ClientKey = %q, want %q", got, testCase.want)
			}
		})
	}
}

func TestNewRefusesBadSettings(t *testing.T) {
	cases := []struct {
		name   string
		config Config
		want   string
	}{
		{"a short key", Config{Limits: ratelimit.DefaultLimits(), BuildKey: "short"}, "shorter than 16"},
		{"a key with white space", Config{Limits: ratelimit.DefaultLimits(), BuildKey: buildKey + "\n"}, "white space"},
		{"no limits", Config{}, "limit"},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := New(testCase.config)
			if err == nil || !strings.Contains(err.Error(), testCase.want) {
				t.Fatalf("error = %v, want one that says %q", err, testCase.want)
			}
		})
	}
}

func TestNewFillsTheDefaults(t *testing.T) {
	guard, err := New(Config{Limits: ratelimit.DefaultLimits()})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if guard.logger != slog.Default() || guard.now == nil || guard.buildKey != nil {
		t.Fatal("New did not fill the default logger and clock, or set a build key")
	}
}

func TestRequireContactRefusesWithInstructions(t *testing.T) {
	fixture := newFixture(t, ratelimit.DefaultLimits(), "")

	recorder := serve(fixture.guard.RequireContact(ok), request(map[string]string{"User-Agent": "curl/8.7.1"}))

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", recorder.Code)
	}
	message, code := decodeError(t, recorder)
	if code != CodeContactRequired {
		t.Fatalf("code = %q, want %q", code, CodeContactRequired)
	}
	for _, part := range []string{
		"User-Agent: my-football-app/1.0 (me@example.com)",
		"the playground at https://api.ohfootball.io/",
		"From: me@example.com",
	} {
		if !strings.Contains(message, part) {
			t.Fatalf("message %q does not hold %q", message, part)
		}
	}
	if !strings.Contains(fixture.logs.String(), "no contact") {
		t.Fatalf("log %q does not name the refusal", fixture.logs)
	}
}

func TestRequireContactLogsOnlyTheContact(t *testing.T) {
	fixture := newFixture(t, ratelimit.DefaultLimits(), "")
	headers := map[string]string{
		"User-Agent": "my-football-app/1.0 (me@example.com)",
		"Cookie":     "session=secret-cookie",
	}

	recorder := serve(fixture.guard.RequireContact(ok), request(headers))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", recorder.Code)
	}
	logs := fixture.logs.String()
	if !strings.Contains(logs, "contact=me@example.com") || !strings.Contains(logs, "address=192.0.2.10") {
		t.Fatalf("log %q does not hold the contact and the address", logs)
	}
	if strings.Contains(logs, "my-football-app") || strings.Contains(logs, "secret-cookie") {
		t.Fatalf("log %q holds more than the contact", logs)
	}
}

func TestLimitRefusesWithRetryAfter(t *testing.T) {
	limits := ratelimit.Limits{
		PerAddress: ratelimit.DefaultLimits().PerAddress,
		Total:      ratelimit.Rate{PerSecond: 1000, Burst: 1000},
	}
	fixture := newFixture(t, limits, "")
	handler := fixture.guard.Limit(ok)
	headers := map[string]string{"User-Agent": "app (me@example.com)"}

	for index := range 20 {
		if recorder := serve(handler, request(headers)); recorder.Code != http.StatusOK {
			t.Fatalf("request %d: status = %d, want 200", index+1, recorder.Code)
		}
	}
	recorder := serve(handler, request(headers))

	if recorder.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", recorder.Code)
	}
	if retry := recorder.Header().Get("Retry-After"); retry != "1" {
		t.Fatalf("Retry-After = %q, want 1", retry)
	}
	message, code := decodeError(t, recorder)
	if code != CodeRateLimited || !strings.Contains(message, "60 requests a minute from one address, and at most 20 at once") {
		t.Fatalf("error = %q, %q, want the limit of one address", message, code)
	}
	logs := fixture.logs.String()
	if !strings.Contains(logs, "rate limited") || !strings.Contains(logs, "contact=me@example.com") {
		t.Fatalf("log %q does not name the refusal and the contact", logs)
	}
}

func TestLimitNamesTheTotalLimit(t *testing.T) {
	limits := ratelimit.Limits{
		PerAddress: ratelimit.Rate{PerSecond: 1000, Burst: 1000},
		Total:      ratelimit.Rate{PerSecond: 0.25, Burst: 1},
	}
	fixture := newFixture(t, limits, "")
	handler := fixture.guard.Limit(ok)

	serve(handler, request(nil))
	recorder := serve(handler, request(nil))

	if recorder.Code != http.StatusTooManyRequests || recorder.Header().Get("Retry-After") != "4" {
		t.Fatalf("status = %d, Retry-After = %q, want 429 and 4", recorder.Code, recorder.Header().Get("Retry-After"))
	}
	if message, _ := decodeError(t, recorder); !strings.Contains(message, "0.25 requests a second from all callers together, and at most 1 at once") {
		t.Fatalf("message %q does not name the total limit", message)
	}
}

func TestBuildKeySkipsBothRules(t *testing.T) {
	limits := ratelimit.Limits{
		PerAddress: ratelimit.Rate{PerSecond: 1, Burst: 1},
		Total:      ratelimit.Rate{PerSecond: 1, Burst: 1},
	}
	fixture := newFixture(t, limits, buildKey)
	handler := fixture.guard.Limit(fixture.guard.RequireContact(ok))

	for _, value := range []string{"Bearer " + buildKey, "bearer " + buildKey, "Bearer  " + buildKey + " "} {
		for range 5 {
			// The build sends no contact.
			if recorder := serve(handler, request(map[string]string{"Authorization": value})); recorder.Code != http.StatusOK {
				t.Fatalf("Authorization %q: status = %d, want 200", value, recorder.Code)
			}
		}
	}
	if fixture.logs.Len() != 0 {
		t.Fatalf("the build was logged: %q", fixture.logs)
	}
}

func TestAWrongKeySkipsNothing(t *testing.T) {
	cases := []struct {
		name, key, header string
	}{
		{"wrong key", buildKey, "Bearer " + buildKey + "x"},
		{"wrong scheme", buildKey, "Basic " + buildKey},
		{"no scheme", buildKey, buildKey},
		{"empty token", buildKey, "Bearer "},
		{"no key set", "", "Bearer "},
		{"no key set and any token", "", "Bearer " + buildKey},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			fixture := newFixture(t, ratelimit.DefaultLimits(), testCase.key)
			handler := fixture.guard.RequireContact(ok)
			recorder := serve(handler, request(map[string]string{"Authorization": testCase.header}))
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400", recorder.Code)
			}
		})
	}
}

func TestRefusalsAreLoggedAtAHeldRate(t *testing.T) {
	fixture := newFixture(t, ratelimit.DefaultLimits(), "")
	handler := fixture.guard.RequireContact(ok)

	for range 30 {
		serve(handler, request(nil))
	}
	if lines := strings.Count(fixture.logs.String(), "\n"); lines != logRate.Burst {
		t.Fatalf("lines = %d, want %d", lines, logRate.Burst)
	}

	fixture.clock.advance(time.Second)
	serve(handler, request(nil))
	lines := strings.Split(strings.TrimSpace(fixture.logs.String()), "\n")
	if last := lines[len(lines)-1]; !strings.Contains(last, "suppressed=20") {
		t.Fatalf("last line %q does not count the lines left out", last)
	}
}

func TestRetryAfterSeconds(t *testing.T) {
	cases := []struct {
		wait time.Duration
		want int
	}{
		{0, 1},
		{time.Millisecond, 1},
		{time.Second, 1},
		{1001 * time.Millisecond, 2},
		{59 * time.Second, 59},
	}
	for _, testCase := range cases {
		if got := retryAfterSeconds(testCase.wait); got != testCase.want {
			t.Fatalf("retryAfterSeconds(%v) = %d, want %d", testCase.wait, got, testCase.want)
		}
	}
}

func TestNumber(t *testing.T) {
	if got := number(50.0 / 60 * 60); got != "50" {
		t.Fatalf("number = %q, want 50", got)
	}
	if got := number(0.125); got != "0.13" {
		t.Fatalf("number = %q, want 0.13", got)
	}
}
