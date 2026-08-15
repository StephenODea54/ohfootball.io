package fetch

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func testOptions() Options {
	return Options{
		RequestsPerSecond: 1000,
		Timeout:           2 * time.Second,
		MaxRetries:        3,
		UserAgent:         "test-agent",
	}
}

// fastRetries shortens the backoff so a test that retries stays quick.
func fastRetries(t *testing.T) {
	t.Helper()
	original := baseRetryDelay
	baseRetryDelay = time.Millisecond
	t.Cleanup(func() { baseRetryDelay = original })
}

func TestGetReturnsBodyAndSetsHeaders(t *testing.T) {
	var userAgent, accept string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userAgent = r.Header.Get("User-Agent")
		accept = r.Header.Get("Accept")
		w.Write([]byte("hello"))
	}))
	defer server.Close()

	body, err := New(testOptions()).Get(context.Background(), server.URL)
	if err != nil {
		t.Fatalf("Get returned %v", err)
	}
	if string(body) != "hello" {
		t.Errorf("body is %q, want %q", body, "hello")
	}
	if userAgent != "test-agent" {
		t.Errorf("User-Agent is %q, want %q", userAgent, "test-agent")
	}
	if accept != "text/html,application/xhtml+xml" {
		t.Errorf("Accept is %q", accept)
	}
}

func TestGetRetriesOnServerErrorThenSucceeds(t *testing.T) {
	fastRetries(t)
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.Write([]byte("second"))
	}))
	defer server.Close()

	body, err := New(testOptions()).Get(context.Background(), server.URL)
	if err != nil {
		t.Fatalf("Get returned %v", err)
	}
	if string(body) != "second" {
		t.Errorf("body is %q, want %q", body, "second")
	}
	if got := calls.Load(); got != 2 {
		t.Errorf("server saw %d calls, want 2", got)
	}
}

func TestGetRetriesOnTooManyRequests(t *testing.T) {
	fastRetries(t)
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.Write([]byte("ok"))
	}))
	defer server.Close()

	if _, err := New(testOptions()).Get(context.Background(), server.URL); err != nil {
		t.Fatalf("Get returned %v", err)
	}
	if got := calls.Load(); got != 2 {
		t.Errorf("server saw %d calls, want 2", got)
	}
}

func TestGetDoesNotRetryOnNotFound(t *testing.T) {
	fastRetries(t)
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	_, err := New(testOptions()).Get(context.Background(), server.URL)
	if err == nil {
		t.Fatal("Get returned no error for status 404")
	}
	if got := calls.Load(); got != 1 {
		t.Errorf("server saw %d calls, want 1", got)
	}
}

func TestGetReturnsLastErrorAfterRetryExhaustion(t *testing.T) {
	fastRetries(t)
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()

	options := testOptions()
	options.MaxRetries = 2
	_, err := New(options).Get(context.Background(), server.URL)
	if err == nil {
		t.Fatal("Get returned no error after every attempt failed")
	}
	if got := calls.Load(); got != 3 {
		t.Errorf("server saw %d calls, want 3", got)
	}
}

func TestGetHonorsRetryAfterInSeconds(t *testing.T) {
	fastRetries(t)
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			w.Header().Set("Retry-After", "1")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.Write([]byte("ok"))
	}))
	defer server.Close()

	start := time.Now()
	if _, err := New(testOptions()).Get(context.Background(), server.URL); err != nil {
		t.Fatalf("Get returned %v", err)
	}
	if elapsed := time.Since(start); elapsed < 900*time.Millisecond {
		t.Errorf("Get waited %v, want at least 900ms from the Retry-After header", elapsed)
	}
}

func TestGetRetriesOnTransportError(t *testing.T) {
	fastRetries(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	address := server.URL
	server.Close()

	options := testOptions()
	options.MaxRetries = 1
	_, err := New(options).Get(context.Background(), address)
	if err == nil {
		t.Fatal("Get returned no error for a closed server")
	}
}

// truncatingHandler sends headers and part of the body, then drops the
// connection. The client then fails inside io.ReadAll rather than earlier.
func truncatingHandler(retryAfter string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if retryAfter != "" {
			w.Header().Set("Retry-After", retryAfter)
		}
		w.Header().Set("Content-Length", "64")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("short"))
		w.(http.Flusher).Flush()
		panic(http.ErrAbortHandler)
	}
}

func TestGetReturnsErrorWhenTheBodyIsCutShort(t *testing.T) {
	fastRetries(t)
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		truncatingHandler("")(w, r)
	}))
	defer server.Close()

	options := testOptions()
	options.MaxRetries = 1
	if _, err := New(options).Get(context.Background(), server.URL); err == nil {
		t.Fatal("Get returned no error for a truncated body")
	}
	if got := calls.Load(); got != 2 {
		t.Errorf("server saw %d calls, want 2", got)
	}
}

func TestGetStopsWhenTheContextIsCancelledAfterABodyReadError(t *testing.T) {
	server := httptest.NewServer(truncatingHandler("3"))
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()
	_, err := New(testOptions()).Get(ctx, server.URL)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Get returned %v, want context.Canceled", err)
	}
}

func TestGetStopsWhenTheContextIsCancelledAfterATransportError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	address := server.URL
	server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()
	_, err := New(testOptions()).Get(ctx, address)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Get returned %v, want context.Canceled", err)
	}
}

func TestGetReturnsErrorForAnInvalidURL(t *testing.T) {
	if _, err := New(testOptions()).Get(context.Background(), "://no-scheme"); err == nil {
		t.Fatal("Get returned no error for an invalid URL")
	}
}

func TestGetStopsWhenTheContextIsAlreadyCancelled(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("the server was called with a cancelled context")
	}))
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := New(testOptions()).Get(ctx, server.URL)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Get returned %v, want context.Canceled", err)
	}
}

func TestGetStopsWhenTheContextIsCancelledDuringTheRetryWait(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()
	_, err := New(testOptions()).Get(ctx, server.URL)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Get returned %v, want context.Canceled", err)
	}
}

// errRejected stands for the reason a caller rejects a body. A real caller
// supplies its own reason, and tells it apart with errors.Is.
var errRejected = errors.New("the body is not the page that was asked for")

// rejectBodies returns an AcceptBody that rejects the first count bodies.
func rejectBodies(count int, seen *atomic.Int32) func([]byte) error {
	return func([]byte) error {
		if seen.Add(1) <= int32(count) {
			return errRejected
		}
		return nil
	}
}

func TestGetAcceptsEveryBodyWhenAcceptBodyIsNil(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("anything"))
	}))
	defer server.Close()

	options := testOptions()
	options.AcceptBody = nil
	body, err := New(options).Get(context.Background(), server.URL)
	if err != nil {
		t.Fatalf("Get returned %v", err)
	}
	if string(body) != "anything" {
		t.Errorf("body is %q, want %q", body, "anything")
	}
}

func TestGetRetriesWhenTheBodyIsRejected(t *testing.T) {
	fastRetries(t)
	var calls, checks atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Write([]byte("body"))
	}))
	defer server.Close()

	options := testOptions()
	options.AcceptBody = rejectBodies(1, &checks)
	body, err := New(options).Get(context.Background(), server.URL)
	if err != nil {
		t.Fatalf("Get returned %v", err)
	}
	if string(body) != "body" {
		t.Errorf("body is %q, want %q", body, "body")
	}
	if got := calls.Load(); got != 2 {
		t.Errorf("server saw %d calls, want 2", got)
	}
}

func TestGetReturnsTheRejectionAfterRetryExhaustion(t *testing.T) {
	fastRetries(t)
	var calls, checks atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Write([]byte("body"))
	}))
	defer server.Close()

	options := testOptions()
	options.MaxRetries = 2
	options.AcceptBody = rejectBodies(99, &checks)
	_, err := New(options).Get(context.Background(), server.URL)
	if !errors.Is(err, errRejected) {
		t.Fatalf("Get returned %v, want an error that wraps the rejection", err)
	}
	if got := calls.Load(); got != 3 {
		t.Errorf("server saw %d calls, want 3", got)
	}
}

func TestGetReturnsTheRejectionWithoutRetryWhenNoneIsAllowed(t *testing.T) {
	var calls, checks atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Write([]byte("body"))
	}))
	defer server.Close()

	options := testOptions()
	options.MaxRetries = 0
	options.AcceptBody = rejectBodies(99, &checks)
	_, err := New(options).Get(context.Background(), server.URL)
	if !errors.Is(err, errRejected) {
		t.Fatalf("Get returned %v, want an error that wraps the rejection", err)
	}
	if got := calls.Load(); got != 1 {
		t.Errorf("server saw %d calls, want 1", got)
	}
}

func TestGetDoesNotReadTheBodyOfAnErrorStatus(t *testing.T) {
	fastRetries(t)
	var checks atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	options := testOptions()
	options.AcceptBody = rejectBodies(99, &checks)
	if _, err := New(options).Get(context.Background(), server.URL); err == nil {
		t.Fatal("Get returned no error for status 404")
	}
	if got := checks.Load(); got != 0 {
		t.Errorf("AcceptBody ran %d times for an error status, want 0", got)
	}
}

func TestGetHonorsRetryAfterWhenTheBodyIsRejected(t *testing.T) {
	fastRetries(t)
	var checks atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "1")
		w.Write([]byte("body"))
	}))
	defer server.Close()

	options := testOptions()
	options.MaxRetries = 1
	options.AcceptBody = rejectBodies(1, &checks)

	start := time.Now()
	if _, err := New(options).Get(context.Background(), server.URL); err != nil {
		t.Fatalf("Get returned %v", err)
	}
	if elapsed := time.Since(start); elapsed < 900*time.Millisecond {
		t.Errorf("Get waited %v, want at least 900ms from the Retry-After header", elapsed)
	}
}

func TestGetStopsWhenTheContextIsCancelledAfterARejectedBody(t *testing.T) {
	var checks atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "3")
		w.Write([]byte("body"))
	}))
	defer server.Close()

	options := testOptions()
	options.AcceptBody = rejectBodies(99, &checks)

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()
	_, err := New(options).Get(ctx, server.URL)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Get returned %v, want context.Canceled", err)
	}
}

func TestWaitForRetryHonorsAnHTTPDate(t *testing.T) {
	fastRetries(t)
	start := time.Now()
	retryAt := start.Add(1100 * time.Millisecond).UTC().Format(http.TimeFormat)
	if err := waitForRetry(context.Background(), 0, retryAt); err != nil {
		t.Fatalf("waitForRetry returned %v", err)
	}
	if elapsed := time.Since(start); elapsed < 500*time.Millisecond {
		t.Errorf("waitForRetry waited %v, want at least 500ms from the HTTP date", elapsed)
	}
}

func TestWaitForRetryIgnoresAnUnusableRetryAfter(t *testing.T) {
	fastRetries(t)
	for _, header := range []string{"", "later", "-5", "0"} {
		start := time.Now()
		if err := waitForRetry(context.Background(), 0, header); err != nil {
			t.Fatalf("waitForRetry returned %v for header %q", err, header)
		}
		if elapsed := time.Since(start); elapsed > time.Second {
			t.Errorf("waitForRetry waited %v for header %q, want the short backoff", elapsed, header)
		}
	}
}

func TestWaitForRetryGrowsWithTheAttemptNumber(t *testing.T) {
	original := baseRetryDelay
	baseRetryDelay = 40 * time.Millisecond
	t.Cleanup(func() { baseRetryDelay = original })

	start := time.Now()
	if err := waitForRetry(context.Background(), 2, ""); err != nil {
		t.Fatalf("waitForRetry returned %v", err)
	}
	if elapsed := time.Since(start); elapsed < 120*time.Millisecond {
		t.Errorf("waitForRetry waited %v on attempt 2, want at least 120ms", elapsed)
	}
}
