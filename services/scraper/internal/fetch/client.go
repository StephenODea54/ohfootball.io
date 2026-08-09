// Package fetch holds the HTTP layer of the scraper. It applies a rate limit
// and a retry policy. It knows nothing about any site.
package fetch

import (
	"context"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"strconv"
	"time"

	"golang.org/x/time/rate"
)

// baseRetryDelay is the first step of the backoff. Each further attempt adds
// one more step. Tests lower this value to stay fast.
var baseRetryDelay = 500 * time.Millisecond

// Options configures a Client. The caller supplies validated values.
type Options struct {
	RequestsPerSecond float64
	Timeout           time.Duration
	MaxRetries        int
	UserAgent         string
}

// Client fetches pages under a shared rate limit.
type Client struct {
	client  *http.Client
	limiter *rate.Limiter
	options Options
}

// New builds a Client. The rate limit is shared by every caller of Get, so it
// bounds the request rate across all concurrent workers.
func New(options Options) *Client {
	return &Client{
		client:  &http.Client{Timeout: options.Timeout},
		limiter: rate.NewLimiter(rate.Limit(options.RequestsPerSecond), 1),
		options: options,
	}
}

// Get fetches one URL and returns its body. It retries on a transport error,
// on HTTP 429, and on any 5xx status. It does not retry on other 4xx statuses.
// It obeys a Retry-After header when the server sends one.
func (c *Client) Get(ctx context.Context, pageURL string) ([]byte, error) {
	var lastErr error
	for attempt := 0; attempt <= c.options.MaxRetries; attempt++ {
		if err := c.limiter.Wait(ctx); err != nil {
			return nil, err
		}

		request, err := http.NewRequestWithContext(ctx, http.MethodGet, pageURL, nil)
		if err != nil {
			return nil, err
		}
		request.Header.Set("User-Agent", c.options.UserAgent)
		request.Header.Set("Accept", "text/html,application/xhtml+xml")

		response, err := c.client.Do(request)
		if err != nil {
			lastErr = err
			if attempt == c.options.MaxRetries {
				break
			}
			if waitErr := waitForRetry(ctx, attempt, ""); waitErr != nil {
				return nil, waitErr
			}
			continue
		}

		body, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil {
			lastErr = err
			if attempt == c.options.MaxRetries {
				break
			}
			if waitErr := waitForRetry(ctx, attempt, response.Header.Get("Retry-After")); waitErr != nil {
				return nil, waitErr
			}
			continue
		}
		if response.StatusCode >= 200 && response.StatusCode < 300 {
			return body, nil
		}

		lastErr = fmt.Errorf("unexpected HTTP status %s", response.Status)
		if response.StatusCode != http.StatusTooManyRequests && response.StatusCode < 500 {
			return nil, lastErr
		}
		if attempt == c.options.MaxRetries {
			break
		}
		if waitErr := waitForRetry(ctx, attempt, response.Header.Get("Retry-After")); waitErr != nil {
			return nil, waitErr
		}
	}
	return nil, lastErr
}

// waitForRetry sleeps before the next attempt. A Retry-After header replaces
// the backoff. The header can hold a count of seconds or an HTTP date.
func waitForRetry(ctx context.Context, attempt int, retryAfter string) error {
	delay := time.Duration(attempt+1)*baseRetryDelay + time.Duration(rand.Int64N(int64(baseRetryDelay/2)+1))
	if seconds, err := strconv.Atoi(retryAfter); err == nil && seconds > 0 {
		delay = time.Duration(seconds) * time.Second
	} else if retryAt, err := http.ParseTime(retryAfter); err == nil && time.Until(retryAt) > 0 {
		delay = time.Until(retryAt)
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
