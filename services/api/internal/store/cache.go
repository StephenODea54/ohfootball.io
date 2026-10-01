package store

import (
	"fmt"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

const (
	// accuracyCacheTTL is how long an answer of ModelAccuracy is kept. The predictions change
	// once a week, so an answer ten minutes old is still right.
	accuracyCacheTTL = 10 * time.Minute
	// accuracyCacheSize is the most answers that are kept. A caller can ask for many ranges, so
	// the cache must not grow without end.
	accuracyCacheSize = 64
)

// answerCache keeps each answer for ttl, and lets identical calls that run at the same time share
// one load. An error is not kept, so the next call tries again.
type answerCache[K comparable, V any] struct {
	ttl  time.Duration
	size int
	now  func() time.Time

	group   singleflight.Group
	mutex   sync.Mutex
	entries map[K]cacheEntry[V]
}

type cacheEntry[V any] struct {
	value   V
	expires time.Time
}

func newAnswerCache[K comparable, V any](ttl time.Duration, size int, now func() time.Time) *answerCache[K, V] {
	return &answerCache[K, V]{ttl: ttl, size: size, now: now, entries: make(map[K]cacheEntry[V])}
}

// get gives the kept answer of key, or loads it. The calls with the same key share one load, so
// two keys must not print the same.
func (cache *answerCache[K, V]) get(key K, load func() (V, error)) (V, error) {
	if value, found := cache.lookup(key); found {
		return value, nil
	}
	shared, err, _ := cache.group.Do(fmt.Sprint(key), func() (any, error) {
		if value, found := cache.lookup(key); found {
			return value, nil
		}
		value, err := load()
		if err != nil {
			return nil, err
		}
		cache.keep(key, value)
		return value, nil
	})
	if err != nil {
		var zero V
		return zero, err
	}
	return shared.(V), nil
}

func (cache *answerCache[K, V]) lookup(key K) (V, bool) {
	cache.mutex.Lock()
	defer cache.mutex.Unlock()
	entry, found := cache.entries[key]
	if !found || !cache.now().Before(entry.expires) {
		delete(cache.entries, key)
		var zero V
		return zero, false
	}
	return entry.value, true
}

// keep stores an answer. When the cache is full, it drops the answers that expired, and then
// every answer when none expired.
func (cache *answerCache[K, V]) keep(key K, value V) {
	cache.mutex.Lock()
	defer cache.mutex.Unlock()
	now := cache.now()
	if len(cache.entries) >= cache.size {
		for old, entry := range cache.entries {
			if !now.Before(entry.expires) {
				delete(cache.entries, old)
			}
		}
		if len(cache.entries) >= cache.size {
			clear(cache.entries)
		}
	}
	cache.entries[key] = cacheEntry[V]{value: value, expires: now.Add(cache.ttl)}
}
