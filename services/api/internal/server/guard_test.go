package server

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/StephenODea54/services/api/internal/ratelimit"
)

// These tests check how the handler applies the rules of the guard to each endpoint. The
// package guard tests the rules themselves.

type testClock struct{ now time.Time }

func (clock *testClock) read() time.Time { return clock.now }

// guardedHandler returns a handler with the default limits, the build key, and a clock that does
// not move, so the limits do not refill while a test runs.
func guardedHandler(t *testing.T, logs *bytes.Buffer) http.Handler {
	t.Helper()
	clock := &testClock{now: time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)}
	return newHandler(t, &fakeStore{season: 2025}, Options{
		SiteBuildKey: siteBuildKey,
		Logger:       slog.New(slog.NewTextHandler(logs, nil)),
		now:          clock.read,
	})
}

func errorCode(t *testing.T, recorder *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Errors []struct {
			Extensions struct {
				Code string `json:"code"`
			} `json:"extensions"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil || len(body.Errors) != 1 {
		t.Fatalf("body %q is not one GraphQL error: %v", recorder.Body, err)
	}
	return body.Errors[0].Extensions.Code
}

func TestGraphQLNeedsAContact(t *testing.T) {
	cases := []struct {
		name      string
		userAgent string
		from      string
		want      int
	}{
		{name: "no contact", want: http.StatusBadRequest},
		{name: "the default of curl", userAgent: "curl/8.7.1", want: http.StatusBadRequest},
		{name: "an email in User-Agent", userAgent: "my-football-app/1.0 (me@example.com)", want: http.StatusOK},
		{name: "a URL in From", userAgent: "Mozilla/5.0", from: "https://example.org", want: http.StatusOK},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			handler := guardedHandler(t, &bytes.Buffer{})
			request := graphqlRequest(t, "{ currentSeason }")
			request.Header.Set("User-Agent", testCase.userAgent)
			if testCase.from != "" {
				request.Header.Set("From", testCase.from)
			}

			recorder := serve(handler, request)

			if recorder.Code != testCase.want {
				t.Fatalf("status = %d, want %d, body %q", recorder.Code, testCase.want, recorder.Body)
			}
			if testCase.want == http.StatusBadRequest && errorCode(t, recorder) != "CONTACT_REQUIRED" {
				t.Fatalf("body %q does not carry CONTACT_REQUIRED", recorder.Body)
			}
		})
	}
}

func TestGraphQLIsLimitedPerAddress(t *testing.T) {
	logs := &bytes.Buffer{}
	clock := &testClock{now: time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)}
	handler := newHandler(t, &fakeStore{season: 2025}, Options{
		// The total limit is set out of reach, so only the limit of one address counts.
		Limits: ratelimit.Limits{
			PerAddress: ratelimit.DefaultLimits().PerAddress,
			Total:      ratelimit.Rate{PerSecond: 1000, Burst: 1000},
		},
		Logger: slog.New(slog.NewTextHandler(logs, nil)),
		now:    clock.read,
	})
	send := func(address string) *httptest.ResponseRecorder {
		request := graphqlRequest(t, "{ currentSeason }")
		request.Header.Set("X-Real-Ip", address)
		return serve(handler, request)
	}

	for index := range 20 {
		if recorder := send("203.0.113.1"); recorder.Code != http.StatusOK {
			t.Fatalf("request %d: status = %d, want 200", index+1, recorder.Code)
		}
	}
	recorder := send("203.0.113.1")
	if recorder.Code != http.StatusTooManyRequests || errorCode(t, recorder) != "RATE_LIMITED" {
		t.Fatalf("status = %d, body %q, want 429 with RATE_LIMITED", recorder.Code, recorder.Body)
	}
	if retry := recorder.Header().Get("Retry-After"); retry != "1" {
		t.Fatalf("Retry-After = %q, want 1", retry)
	}
	if recorder := send("203.0.113.2"); recorder.Code != http.StatusOK {
		t.Fatalf("another address: status = %d, want 200", recorder.Code)
	}
	if !strings.Contains(logs.String(), "contact=test@example.com") {
		t.Fatalf("log %q does not name the contact", logs)
	}
}

func TestGraphQLHasATotalLimit(t *testing.T) {
	handler := guardedHandler(t, &bytes.Buffer{})

	// The default total limit has a burst of 40. Each request comes from its own address.
	for index := range 40 {
		request := graphqlRequest(t, "{ currentSeason }")
		request.Header.Set("X-Real-Ip", "203.0.113."+strconv.Itoa(index))
		if recorder := serve(handler, request); recorder.Code != http.StatusOK {
			t.Fatalf("request %d: status = %d, want 200", index+1, recorder.Code)
		}
	}
	request := graphqlRequest(t, "{ currentSeason }")
	request.Header.Set("X-Real-Ip", "198.51.100.1")
	recorder := serve(handler, request)
	if recorder.Code != http.StatusTooManyRequests || recorder.Header().Get("Retry-After") != "1" {
		t.Fatalf("status = %d, Retry-After = %q, want 429 and 1", recorder.Code, recorder.Header().Get("Retry-After"))
	}
}

func TestSiteBuildSkipsTheRules(t *testing.T) {
	handler := guardedHandler(t, &bytes.Buffer{})

	// Far more than both limits allow, and with no contact, as the build sends.
	for index := range 100 {
		request := graphqlRequest(t, "{ currentSeason }")
		request.Header.Del("User-Agent")
		request.Header.Set("Authorization", "Bearer "+siteBuildKey)
		if recorder := serve(handler, request); recorder.Code != http.StatusOK {
			t.Fatalf("request %d: status = %d, want 200", index+1, recorder.Code)
		}
	}
}

func TestHealthEndpointsSkipTheRules(t *testing.T) {
	handler := guardedHandler(t, &bytes.Buffer{})
	for range 100 {
		serve(handler, graphqlRequest(t, "{ currentSeason }"))
	}
	if recorder := post(t, handler, "{ currentSeason }"); recorder.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429 after the limits ran out", recorder.Code)
	}

	for _, path := range []string{"/healthz", "/readyz"} {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		request.Header.Del("User-Agent")
		if recorder := serve(handler, request); recorder.Code != http.StatusNoContent {
			t.Fatalf("%s: status = %d, want 204", path, recorder.Code)
		}
	}
}

func TestPlaygroundNeedsNoContactButCounts(t *testing.T) {
	handler := guardedHandler(t, &bytes.Buffer{})
	open := func() *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodGet, "/", nil)
		request.Header.Set("User-Agent", "Mozilla/5.0")
		request.Header.Set("X-Real-Ip", "203.0.113.9")
		return serve(handler, request)
	}

	recorder := open()
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", recorder.Code)
	}
	// The Headers pane starts with a From header that the caller fills in.
	if !strings.Contains(recorder.Body.String(), playgroundHeaders["From"]) {
		t.Fatal("the playground does not fill the Headers pane with a From header")
	}

	// The default burst of one address is 20.
	for index := range 19 {
		if recorder := open(); recorder.Code != http.StatusOK {
			t.Fatalf("open %d: status = %d, want 200", index+2, recorder.Code)
		}
	}
	if recorder := open(); recorder.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429 after the burst of the address", recorder.Code)
	}
}

func TestPlaygroundHeaderHoldsNoContact(t *testing.T) {
	// The value tells the caller what to write. It must fail the rule, or every caller of the
	// playground would pass with the same text.
	request := graphqlRequest(t, "{ currentSeason }")
	request.Header.Del("User-Agent")
	request.Header.Set("From", playgroundHeaders["From"])

	if recorder := serve(guardedHandler(t, &bytes.Buffer{}), request); recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", recorder.Code)
	}
}

func TestNewRefusesAShortBuildKey(t *testing.T) {
	if _, err := New(&fakeStore{}, Options{SiteBuildKey: "short"}); err == nil {
		t.Fatal("New accepted a build key shorter than 16 characters")
	}
}

func TestNewUsesTheLimitsItIsGiven(t *testing.T) {
	handler := newHandler(t, &fakeStore{}, Options{Limits: ratelimit.Limits{
		PerAddress: ratelimit.Rate{PerSecond: 1, Burst: 1},
		Total:      ratelimit.Rate{PerSecond: 1, Burst: 1},
	}})

	if recorder := post(t, handler, "{ currentSeason }"); recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", recorder.Code)
	}
	if recorder := post(t, handler, "{ currentSeason }"); recorder.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", recorder.Code)
	}
}

func TestSchemaNeedsNoContact(t *testing.T) {
	get := httptest.NewRequest(http.MethodGet, "/graphql?query="+url.QueryEscape("{ __typename }"), nil)
	post := graphqlRequest(t, graphiqlIntrospection(t))
	for name, request := range map[string]*http.Request{"a GET": get, "a POST": post} {
		t.Run(name, func(t *testing.T) {
			request.Header.Set("User-Agent", "curl/8.7.1")
			recorder := serve(guardedHandler(t, &bytes.Buffer{}), request)
			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200, body %q", recorder.Code, recorder.Body)
			}
			if response := decode(t, recorder); response["errors"] != nil || response["data"] == nil {
				t.Fatalf("response %v holds no data or holds errors", response)
			}
		})
	}
}

func TestSchemaQueriesCount(t *testing.T) {
	handler := guardedHandler(t, &bytes.Buffer{})
	send := func() int {
		request := graphqlRequest(t, "{ __typename }")
		request.Header.Del("User-Agent")
		request.Header.Set("X-Real-Ip", "203.0.113.20")
		return serve(handler, request).Code
	}

	// The default burst of one address is 20.
	for index := range 20 {
		if status := send(); status != http.StatusOK {
			t.Fatalf("request %d: status = %d, want 200", index+1, status)
		}
	}
	if status := send(); status != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429 after the burst of the address", status)
	}
}
