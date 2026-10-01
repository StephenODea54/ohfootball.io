package store

import (
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// clock is a time that a test moves by hand.
type clock struct{ now time.Time }

func (c *clock) read() time.Time { return c.now }

func TestAnswerCacheKeepsAnAnswerForItsTTL(t *testing.T) {
	now := &clock{now: time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC)}
	cache := newAnswerCache[int, string](10*time.Minute, 4, now.read)
	loads := 0
	load := func() (string, error) {
		loads++
		return "answer", nil
	}

	for range 3 {
		if value, err := cache.get(1, load); err != nil || value != "answer" {
			t.Fatalf("get = %q, %v, want the answer", value, err)
		}
	}
	if loads != 1 {
		t.Fatalf("loads = %d, want 1 inside the TTL", loads)
	}
	now.now = now.now.Add(10 * time.Minute)
	if _, err := cache.get(1, load); err != nil || loads != 2 {
		t.Fatalf("loads = %d, %v, want a new load when the TTL ends", loads, err)
	}
}

func TestAnswerCacheDoesNotKeepAnError(t *testing.T) {
	cache := newAnswerCache[int, string](time.Minute, 4, time.Now)
	failure := errors.New("database down")
	if _, err := cache.get(1, func() (string, error) { return "", failure }); !errors.Is(err, failure) {
		t.Fatalf("error = %v, want the error of the load", err)
	}
	if value, err := cache.get(1, func() (string, error) { return "answer", nil }); err != nil || value != "answer" {
		t.Fatalf("get after an error = %q, %v, want a new load", value, err)
	}
}

func TestAnswerCacheSharesOneLoadBetweenCallsAtTheSameTime(t *testing.T) {
	cache := newAnswerCache[int, string](time.Minute, 4, time.Now)
	var loads atomic.Int32
	started := make(chan struct{})
	release := make(chan struct{})
	load := func() (string, error) {
		if loads.Add(1) == 1 {
			close(started)
		}
		<-release
		return "answer", nil
	}

	var waiting sync.WaitGroup
	results := make(chan string, 8)
	call := func() {
		defer waiting.Done()
		value, _ := cache.get(1, load)
		results <- value
	}
	waiting.Add(1)
	go call()
	<-started
	for range 7 {
		waiting.Add(1)
		go call()
	}
	// The other calls join the load that runs. They cannot finish before it is released.
	time.Sleep(50 * time.Millisecond)
	close(release)
	waiting.Wait()
	close(results)

	if loads.Load() != 1 {
		t.Fatalf("loads = %d, want 1 for calls at the same time", loads.Load())
	}
	for value := range results {
		if value != "answer" {
			t.Fatalf("a call got %q, want the shared answer", value)
		}
	}
}

func TestAnswerCacheStaysInsideItsSize(t *testing.T) {
	now := &clock{now: time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC)}
	cache := newAnswerCache[int, int](time.Minute, 2, now.read)
	answer := func(value int) func() (int, error) { return func() (int, error) { return value, nil } }

	_, _ = cache.get(1, answer(1))
	now.now = now.now.Add(time.Minute)
	_, _ = cache.get(2, answer(2))
	_, _ = cache.get(3, answer(3))
	if len(cache.entries) != 2 {
		t.Fatalf("entries = %d, want the expired answer dropped", len(cache.entries))
	}
	_, _ = cache.get(4, answer(4))
	if len(cache.entries) != 1 {
		t.Fatalf("entries = %d, want every answer dropped when none expired", len(cache.entries))
	}
	if value, _ := cache.get(4, answer(40)); value != 4 {
		t.Fatalf("get = %d, want the kept answer 4", value)
	}
}
