package ratelimit

import (
	"sync"
	"time"
)

// Limits are the two limits that every counted request passes.
type Limits struct {
	// PerAddress is the limit of one client address.
	PerAddress Rate
	// Total is the limit of all clients together.
	Total Rate
}

// DefaultLimits are 60 requests a minute from one address with a burst of 20, and 20 requests a
// second in total with a burst of 40. The burst of one address is smaller than the total burst, so
// one address that sends its whole burst at once cannot empty the total bucket for all callers.
func DefaultLimits() Limits {
	return Limits{
		PerAddress: Rate{PerSecond: 1, Burst: 20},
		Total:      Rate{PerSecond: 20, Burst: 40},
	}
}

// Validate returns an error when a rate or a burst is not more than zero.
func (limits Limits) Validate() error {
	if err := limits.PerAddress.validate("the limit of one address"); err != nil {
		return err
	}
	return limits.Total.validate("the total limit")
}

// The scope of a refusal tells which limit refused the request.
const (
	ScopeAddress = "address"
	ScopeTotal   = "total"
)

// Decision is the answer of the limiter to one request.
type Decision struct {
	Allowed bool
	// RetryAfter is the time until the request would pass. It is zero when the request passed.
	RetryAfter time.Duration
	// Scope names the limit that refused the request. It is empty when the request passed.
	Scope string
}

// sweepEvery is how often the limiter drops the buckets of addresses that are idle.
const sweepEvery = time.Minute

// Limiter holds the bucket of each address and the total bucket. It is safe for concurrent use.
type Limiter struct {
	mutex     sync.Mutex
	limits    Limits
	now       func() time.Time
	total     *Bucket
	buckets   map[string]*Bucket
	lastSweep time.Time
}

// New returns a limiter that reads the time from now. Tests pass a clock that they move by hand.
func New(limits Limits, now func() time.Time) (*Limiter, error) {
	if now == nil {
		return nil, errNoClock
	}
	if err := limits.Validate(); err != nil {
		return nil, err
	}
	start := now()
	return &Limiter{
		limits:    limits,
		now:       now,
		total:     NewBucket(limits.Total, start),
		buckets:   map[string]*Bucket{},
		lastSweep: start,
	}, nil
}

// Allow counts one request from the address named by key. A request passes only when both
// limits have a token, and then it takes a token from each. A refused request takes nothing, so
// a client over its own limit does not use up the total limit of the others.
func (limiter *Limiter) Allow(key string) Decision {
	limiter.mutex.Lock()
	defer limiter.mutex.Unlock()

	now := limiter.now()
	limiter.sweep(now)

	// A new bucket is full, and a full bucket acts the same as no bucket. So the limiter stores
	// a bucket only for a request that passes. The number of stored buckets then stays below the
	// number of requests that the total limit lets through in the time a bucket takes to fill,
	// plus one sweepEvery.
	bucket, found := limiter.buckets[key]
	if !found {
		bucket = NewBucket(limiter.limits.PerAddress, now)
	}
	addressWait := bucket.wait(now)
	totalWait := limiter.total.wait(now)
	switch {
	case addressWait > 0 && addressWait >= totalWait:
		return Decision{RetryAfter: addressWait, Scope: ScopeAddress}
	case totalWait > 0:
		return Decision{RetryAfter: totalWait, Scope: ScopeTotal}
	}
	bucket.take()
	limiter.total.take()
	limiter.buckets[key] = bucket
	return Decision{Allowed: true}
}

// sweep drops the buckets that have filled up again, at most once each sweepEvery. It runs
// inside Allow, so the limiter needs no goroutine of its own.
func (limiter *Limiter) sweep(now time.Time) {
	if now.Sub(limiter.lastSweep) < sweepEvery {
		return
	}
	for key, bucket := range limiter.buckets {
		if bucket.full(now) {
			delete(limiter.buckets, key)
		}
	}
	limiter.lastSweep = now
}

// size returns the number of stored buckets.
func (limiter *Limiter) size() int {
	limiter.mutex.Lock()
	defer limiter.mutex.Unlock()
	return len(limiter.buckets)
}
