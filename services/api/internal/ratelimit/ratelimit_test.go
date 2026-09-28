package ratelimit

import (
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"
)

// clock is a time source that a test moves by hand.
type clock struct{ now time.Time }

func (clock *clock) read() time.Time            { return clock.now }
func (clock *clock) advance(step time.Duration) { clock.now = clock.now.Add(step) }

func newClock() *clock { return &clock{now: time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)} }

func newLimiter(t *testing.T, limits Limits) (*Limiter, *clock) {
	t.Helper()
	clock := newClock()
	limiter, err := New(limits, clock.read)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return limiter, clock
}

// wide is a limit that a test does not reach.
var wide = Rate{PerSecond: 1000, Burst: 1000}

func TestBucketTakesUntilEmptyAndRefills(t *testing.T) {
	clock := newClock()
	bucket := NewBucket(Rate{PerSecond: 2, Burst: 3}, clock.read())

	for index := range 3 {
		if ok, _ := bucket.Take(clock.read()); !ok {
			t.Fatalf("take %d was refused", index+1)
		}
	}
	ok, wait := bucket.Take(clock.read())
	if ok || wait != 500*time.Millisecond {
		t.Fatalf("take from an empty bucket = %v, %v, want false, 500ms", ok, wait)
	}

	clock.advance(500 * time.Millisecond)
	if ok, _ := bucket.Take(clock.read()); !ok {
		t.Fatal("the bucket did not refill")
	}
}

func TestBucketDoesNotFillPastItsBurst(t *testing.T) {
	clock := newClock()
	bucket := NewBucket(Rate{PerSecond: 1, Burst: 2}, clock.read())
	clock.advance(time.Hour)

	for range 2 {
		bucket.Take(clock.read())
	}
	if ok, _ := bucket.Take(clock.read()); ok {
		t.Fatal("the bucket held more than its burst")
	}
}

func TestBucketIgnoresAClockThatGoesBack(t *testing.T) {
	clock := newClock()
	bucket := NewBucket(Rate{PerSecond: 1, Burst: 1}, clock.read())
	bucket.Take(clock.read())

	clock.advance(-time.Hour)
	if ok, _ := bucket.Take(clock.read()); ok {
		t.Fatal("a clock that went back refilled the bucket")
	}
}

func TestNewRefusesBadSettings(t *testing.T) {
	cases := []struct {
		name   string
		limits Limits
		want   string
	}{
		{"no rate for an address", Limits{PerAddress: Rate{0, 1}, Total: wide}, "one address"},
		{"no burst for an address", Limits{PerAddress: Rate{1, 0}, Total: wide}, "one address"},
		{"no total rate", Limits{PerAddress: wide, Total: Rate{-1, 1}}, "total"},
		{"no total burst", Limits{PerAddress: wide, Total: Rate{1, 0}}, "total"},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := New(testCase.limits, newClock().read)
			if err == nil || !strings.Contains(err.Error(), testCase.want) {
				t.Fatalf("error = %v, want one that names %q", err, testCase.want)
			}
		})
	}
}

func TestNewRefusesANilClock(t *testing.T) {
	if _, err := New(DefaultLimits(), nil); err == nil {
		t.Fatal("New accepted a nil clock")
	}
}

func TestDefaultLimits(t *testing.T) {
	limits := DefaultLimits()
	if limits.PerAddress != (Rate{PerSecond: 1, Burst: 20}) {
		t.Fatalf("PerAddress = %+v, want 60 a minute with a burst of 20", limits.PerAddress)
	}
	if limits.PerAddress.Burst > limits.Total.Burst {
		t.Fatal("one address can empty the total bucket with its burst")
	}
	if limits.Total != (Rate{PerSecond: 20, Burst: 40}) {
		t.Fatalf("Total = %+v, want 20 a second with a burst of 40", limits.Total)
	}
}

func TestAddressLimitRefusesARequestAfterTheBurst(t *testing.T) {
	limiter, clock := newLimiter(t, Limits{PerAddress: DefaultLimits().PerAddress, Total: wide})

	for index := range 20 {
		if decision := limiter.Allow("192.0.2.1"); !decision.Allowed {
			t.Fatalf("request %d was refused: %+v", index+1, decision)
		}
	}
	decision := limiter.Allow("192.0.2.1")
	if decision.Allowed || decision.Scope != ScopeAddress || decision.RetryAfter != time.Second {
		t.Fatalf("request 21 = %+v, want a refusal by the limit of the address after 1s", decision)
	}
	if other := limiter.Allow("192.0.2.2"); !other.Allowed {
		t.Fatalf("another address was refused: %+v", other)
	}

	// The bucket gets one token back each second.
	clock.advance(time.Second)
	if decision := limiter.Allow("192.0.2.1"); !decision.Allowed {
		t.Fatalf("the address did not get a token back: %+v", decision)
	}
	if decision := limiter.Allow("192.0.2.1"); decision.Allowed {
		t.Fatal("the address got more than one token back in one second")
	}
}

func TestAddressLimitLetsSixtyThroughEachMinuteAfterTheBurst(t *testing.T) {
	limiter, clock := newLimiter(t, Limits{PerAddress: DefaultLimits().PerAddress, Total: wide})
	for range 20 {
		limiter.Allow("192.0.2.1")
	}

	allowed := 0
	for range 120 {
		clock.advance(500 * time.Millisecond)
		if limiter.Allow("192.0.2.1").Allowed {
			allowed++
		}
	}
	if allowed != 60 {
		t.Fatalf("allowed in the minute after the burst = %d, want 60", allowed)
	}
}

func TestOneAddressCannotEmptyTheDefaultTotalLimit(t *testing.T) {
	limiter, _ := newLimiter(t, DefaultLimits())
	for range 70 {
		limiter.Allow("192.0.2.1")
	}
	if decision := limiter.Allow("192.0.2.2"); !decision.Allowed {
		t.Fatalf("one address emptied the total limit for another: %+v", decision)
	}
}

func TestTotalLimitHoldsAcrossAddresses(t *testing.T) {
	limiter, clock := newLimiter(t, DefaultLimits())

	for index := range 40 {
		if decision := limiter.Allow(fmt.Sprintf("192.0.2.%d", index)); !decision.Allowed {
			t.Fatalf("request %d was refused: %+v", index+1, decision)
		}
	}
	decision := limiter.Allow("198.51.100.1")
	if decision.Allowed || decision.Scope != ScopeTotal || decision.RetryAfter != 50*time.Millisecond {
		t.Fatalf("request 41 = %+v, want a refusal by the total limit after 50ms", decision)
	}

	clock.advance(50 * time.Millisecond)
	if decision := limiter.Allow("198.51.100.1"); !decision.Allowed {
		t.Fatalf("the total limit did not refill: %+v", decision)
	}
}

func TestARefusedRequestTakesNoToken(t *testing.T) {
	limiter, _ := newLimiter(t, Limits{PerAddress: Rate{PerSecond: 1, Burst: 1}, Total: Rate{PerSecond: 1, Burst: 2}})

	limiter.Allow("192.0.2.1")
	for range 5 {
		if decision := limiter.Allow("192.0.2.1"); decision.Allowed {
			t.Fatal("the address passed its own limit")
		}
	}
	if decision := limiter.Allow("192.0.2.2"); !decision.Allowed {
		t.Fatalf("refused requests used up the total limit: %+v", decision)
	}
}

func TestTheLongerWaitNamesTheScope(t *testing.T) {
	limiter, _ := newLimiter(t, Limits{PerAddress: Rate{PerSecond: 1, Burst: 1}, Total: Rate{PerSecond: 0.1, Burst: 1}})

	limiter.Allow("192.0.2.1")
	decision := limiter.Allow("192.0.2.1")
	if decision.Scope != ScopeTotal || decision.RetryAfter != 10*time.Second {
		t.Fatalf("decision = %+v, want the total limit with 10s", decision)
	}
}

func TestSweepDropsIdleBuckets(t *testing.T) {
	limiter, clock := newLimiter(t, Limits{PerAddress: Rate{PerSecond: 0.5, Burst: 60}, Total: wide})

	for index := range 10 {
		for range 60 {
			limiter.Allow(fmt.Sprintf("192.0.2.%d", index))
		}
	}
	if size := limiter.size(); size != 10 {
		t.Fatalf("size = %d, want 10", size)
	}

	// A sweep drops only full buckets. An empty bucket takes two minutes to fill.
	clock.advance(sweepEvery)
	limiter.Allow("198.51.100.1")
	if size := limiter.size(); size != 11 {
		t.Fatalf("size after an early sweep = %d, want 11", size)
	}

	clock.advance(sweepEvery)
	limiter.Allow("198.51.100.1")
	if size := limiter.size(); size != 1 {
		t.Fatalf("size after the buckets filled = %d, want 1", size)
	}
}

func TestARefusedNewAddressStoresNoBucket(t *testing.T) {
	limiter, _ := newLimiter(t, Limits{PerAddress: wide, Total: Rate{PerSecond: 1, Burst: 1}})

	limiter.Allow("192.0.2.1")
	for index := range 100 {
		limiter.Allow(fmt.Sprintf("198.51.100.%d", index))
	}
	if size := limiter.size(); size != 1 {
		t.Fatalf("size = %d, want 1", size)
	}
}

func TestAllowIsSafeForConcurrentUse(t *testing.T) {
	limiter, _ := newLimiter(t, Limits{PerAddress: Rate{PerSecond: 1, Burst: 50}, Total: wide})

	var group sync.WaitGroup
	var mutex sync.Mutex
	allowed := 0
	for range 100 {
		group.Go(func() {
			if limiter.Allow("192.0.2.1").Allowed {
				mutex.Lock()
				allowed++
				mutex.Unlock()
			}
		})
	}
	group.Wait()
	if allowed != 50 {
		t.Fatalf("allowed = %d, want 50", allowed)
	}
}
