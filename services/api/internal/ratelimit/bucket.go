// Package ratelimit counts requests in memory with token buckets. It keeps no state outside the
// process, so each instance of the API counts on its own, and a restart starts every count again.
package ratelimit

import (
	"errors"
	"fmt"
	"time"
)

// Rate is the size of a bucket and how fast it fills.
type Rate struct {
	// PerSecond is the number of tokens the bucket gets back each second.
	PerSecond float64
	// Burst is the most tokens the bucket holds. A full bucket lets this many requests through
	// at once.
	Burst int
}

func (rate Rate) validate(name string) error {
	if rate.PerSecond <= 0 || rate.Burst < 1 {
		return fmt.Errorf("%s: the rate must be more than zero and the burst at least 1", name)
	}
	return nil
}

// Bucket is one token bucket. It is not safe for concurrent use. The caller holds a lock.
type Bucket struct {
	rate   Rate
	tokens float64
	last   time.Time
}

// NewBucket returns a full bucket.
func NewBucket(rate Rate, now time.Time) *Bucket {
	return &Bucket{rate: rate, tokens: float64(rate.Burst), last: now}
}

// refill adds the tokens that the time since the last call gave back. A clock that goes back
// adds nothing.
func (bucket *Bucket) refill(now time.Time) {
	if elapsed := now.Sub(bucket.last); elapsed > 0 {
		bucket.tokens += elapsed.Seconds() * bucket.rate.PerSecond
		if limit := float64(bucket.rate.Burst); bucket.tokens > limit {
			bucket.tokens = limit
		}
		bucket.last = now
	}
}

// wait returns zero when the bucket holds a token. Otherwise it returns the time until it holds
// one.
func (bucket *Bucket) wait(now time.Time) time.Duration {
	bucket.refill(now)
	if bucket.tokens >= 1 {
		return 0
	}
	return time.Duration((1 - bucket.tokens) / bucket.rate.PerSecond * float64(time.Second))
}

// take removes one token. Call it only after wait returned zero.
func (bucket *Bucket) take() { bucket.tokens-- }

// Take removes one token when the bucket holds one. Otherwise it returns the time until it holds
// one and removes nothing.
func (bucket *Bucket) Take(now time.Time) (bool, time.Duration) {
	if wait := bucket.wait(now); wait > 0 {
		return false, wait
	}
	bucket.take()
	return true, 0
}

// full reports whether the bucket has filled up again. A full bucket acts the same as a new one,
// so the limiter can drop it.
func (bucket *Bucket) full(now time.Time) bool {
	bucket.refill(now)
	return bucket.tokens >= float64(bucket.rate.Burst)
}

// errNoClock is returned when a limiter is made without a clock.
var errNoClock = errors.New("ratelimit: the clock is nil")
