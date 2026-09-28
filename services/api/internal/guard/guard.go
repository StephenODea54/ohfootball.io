package guard

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/StephenODea54/services/api/internal/ratelimit"
)

// The codes in the extensions of an error that the guard sends.
const (
	CodeContactRequired = "CONTACT_REQUIRED"
	CodeRateLimited     = "RATE_LIMITED"
)

// MinBuildKeyLength is the shortest build key the guard accepts. The site refuses a shorter key
// too.
const MinBuildKeyLength = 16

// contactMessage tells a caller what to send.
const contactMessage = "Tell the API who you are. Send a User-Agent header that holds an email " +
	"address or an http(s) URL, for example: User-Agent: my-football-app/1.0 (me@example.com). " +
	"If you cannot set User-Agent, for example in the playground at https://api.ohfootball.io/, " +
	"send the email address or the URL in a From header, for example: From: me@example.com."

// logRate limits the log lines about refused requests, because a client can send them without
// end. The lines about requests that pass are held by the rate limits already.
var logRate = ratelimit.Rate{PerSecond: 1, Burst: 10}

// Config holds the settings of a guard.
type Config struct {
	// Limits are the rate limits.
	Limits ratelimit.Limits
	// BuildKey lets the build of the site skip the contact rule and the rate limits when it
	// sends the key as a bearer token. An empty key lets no request skip them.
	BuildKey string
	// Logger receives one line for each counted request. Nil selects slog.Default.
	Logger *slog.Logger
	// Now reads the time. Nil selects time.Now. Tests pass a clock that they move by hand.
	Now func() time.Time
}

// Guard applies the contact rule and the rate limits.
type Guard struct {
	limiter  *ratelimit.Limiter
	limits   ratelimit.Limits
	buildKey *[sha256.Size]byte
	logger   *slog.Logger
	now      func() time.Time

	logMutex   sync.Mutex
	logBucket  *ratelimit.Bucket
	suppressed int
}

// CheckBuildKey refuses a build key shorter than MinBuildKeyLength, and a key with white space at
// either end, which is often a copy error. An empty key is valid and lets no request skip the
// rules.
func CheckBuildKey(key string) error {
	if key != "" && len(key) < MinBuildKeyLength {
		return fmt.Errorf("the build key is shorter than %d characters", MinBuildKeyLength)
	}
	if strings.TrimSpace(key) != key {
		return errors.New("the build key starts or ends with white space")
	}
	return nil
}

// New returns a guard. It refuses a build key that CheckBuildKey refuses, and limits that are not
// more than zero.
func New(config Config) (*Guard, error) {
	if err := CheckBuildKey(config.BuildKey); err != nil {
		return nil, err
	}
	now := config.Now
	if now == nil {
		now = time.Now
	}
	limiter, err := ratelimit.New(config.Limits, now)
	if err != nil {
		return nil, err
	}
	logger := config.Logger
	if logger == nil {
		logger = slog.Default()
	}
	guard := &Guard{
		limiter:   limiter,
		limits:    config.Limits,
		logger:    logger,
		now:       now,
		logBucket: ratelimit.NewBucket(logRate, now()),
	}
	if config.BuildKey != "" {
		sum := sha256.Sum256([]byte(config.BuildKey))
		guard.buildKey = &sum
	}
	return guard, nil
}

// isBuild reports whether the request carries the build key. Both sides are hashed first, so
// the comparison takes the same time for a key of any length.
func (guard *Guard) isBuild(request *http.Request) bool {
	if guard.buildKey == nil {
		return false
	}
	scheme, token, found := strings.Cut(request.Header.Get("Authorization"), " ")
	if !found || !strings.EqualFold(scheme, "Bearer") {
		return false
	}
	sum := sha256.Sum256([]byte(strings.TrimSpace(token)))
	return subtle.ConstantTimeCompare(sum[:], guard.buildKey[:]) == 1
}

// Limit refuses a request over a rate limit with 429 and a Retry-After header.
func (guard *Guard) Limit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if guard.isBuild(request) {
			next.ServeHTTP(writer, request)
			return
		}
		key := ClientKey(request)
		decision := guard.limiter.Allow(key)
		if decision.Allowed {
			next.ServeHTTP(writer, request)
			return
		}

		seconds := retryAfterSeconds(decision.RetryAfter)
		contact, _ := Contact(request.UserAgent(), request.Header.Get("From"))
		guard.logRefusal(
			"request refused: rate limited",
			"address", key, "contact", contact, "scope", decision.Scope, "retry_after", seconds,
		)
		writer.Header().Set("Retry-After", strconv.Itoa(seconds))
		writeError(writer, http.StatusTooManyRequests, CodeRateLimited, guard.limitMessage(decision.Scope))
	})
}

// RequireContact refuses a request that names no contact with 400. It logs the contact of each
// request that passes.
//
// A request that reads only the schema needs no contact, so the playground and the tools that
// read the schema work before the caller writes a contact. Such a request reads nothing from the
// store, but it is not free. Put Limit in front of this handler, so these requests count toward
// the rate limits too, and cap the size of the query in the next handler.
func (guard *Guard) RequireContact(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if guard.isBuild(request) {
			next.ServeHTTP(writer, request)
			return
		}
		key := ClientKey(request)
		contact, found := Contact(request.UserAgent(), request.Header.Get("From"))
		if !found && asksForSchemaOnly(request) {
			guard.logger.Info("request", "address", key, "schema", true, "path", request.URL.Path)
			next.ServeHTTP(writer, request)
			return
		}
		if !found {
			guard.logRefusal("request refused: no contact", "address", key, "path", request.URL.Path)
			writeError(writer, http.StatusBadRequest, CodeContactRequired, contactMessage)
			return
		}
		guard.logger.Info("request", "address", key, "contact", contact, "path", request.URL.Path)
		next.ServeHTTP(writer, request)
	})
}

// logRefusal writes a line about a refused request, at most as often as logRate allows. The next
// line that is written counts the lines that were left out.
func (guard *Guard) logRefusal(message string, attributes ...any) {
	guard.logMutex.Lock()
	defer guard.logMutex.Unlock()
	if ok, _ := guard.logBucket.Take(guard.now()); !ok {
		guard.suppressed++
		return
	}
	if guard.suppressed > 0 {
		attributes = append(attributes, "suppressed", guard.suppressed)
		guard.suppressed = 0
	}
	guard.logger.Info(message, attributes...)
}

// limitMessage names the limit that refused a request.
func (guard *Guard) limitMessage(scope string) string {
	limit := fmt.Sprintf("%s requests a minute from one address, and at most %d at once",
		number(guard.limits.PerAddress.PerSecond*60), guard.limits.PerAddress.Burst)
	if scope == ratelimit.ScopeTotal {
		limit = fmt.Sprintf("%s requests a second from all callers together, and at most %d at once",
			number(guard.limits.Total.PerSecond), guard.limits.Total.Burst)
	}
	return "Too many requests. The limit is " + limit + ". Wait for the number of seconds in " +
		"the Retry-After header, then try again. For a large download, use the Kaggle dataset."
}

// number writes a rate with at most two decimals, so 50 a minute does not print as 49.999.
func number(value float64) string {
	return strconv.FormatFloat(math.Round(value*100)/100, 'f', -1, 64)
}

// retryAfterSeconds rounds a wait up to whole seconds, and it is never less than one.
func retryAfterSeconds(wait time.Duration) int {
	return max(1, int(math.Ceil(wait.Seconds())))
}

type errorBody struct {
	Errors []errorEntry `json:"errors"`
}

type errorEntry struct {
	Message    string            `json:"message"`
	Extensions map[string]string `json:"extensions"`
}

// writeError answers in the form of a GraphQL error, so a GraphQL client shows the message.
func writeError(writer http.ResponseWriter, status int, code, message string) {
	body, _ := json.Marshal(errorBody{Errors: []errorEntry{{
		Message:    message,
		Extensions: map[string]string{"code": code},
	}}})
	writer.Header().Set("Content-Type", "application/json")
	writer.Header().Set("Cache-Control", "no-store")
	writer.WriteHeader(status)
	_, _ = writer.Write(body)
}
