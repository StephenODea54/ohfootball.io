package pipeline

import (
	"context"
	"errors"
	"runtime"
	"slices"
	"sync/atomic"
	"testing"
	"time"
)

// assertNoExtraGoroutines fails when the test leaves goroutines behind. It
// gives them a short time to finish, because a returning goroutine is not
// always scheduled at once.
func assertNoExtraGoroutines(t *testing.T) {
	t.Helper()
	before := runtime.NumGoroutine()
	t.Cleanup(func() {
		for range 100 {
			if runtime.NumGoroutine() <= before {
				return
			}
			time.Sleep(10 * time.Millisecond)
		}
		t.Errorf("goroutine count grew from %d to %d", before, runtime.NumGoroutine())
	})
}

func TestFanOutReturnsEveryOutput(t *testing.T) {
	assertNoExtraGoroutines(t)
	in := []int{1, 2, 3, 4, 5, 6, 7}

	out, err := FanOut(context.Background(), 3, in, func(_ context.Context, value int) (int, error) {
		return value * 2, nil
	})
	if err != nil {
		t.Fatalf("FanOut returned %v", err)
	}
	slices.Sort(out)
	want := []int{2, 4, 6, 8, 10, 12, 14}
	if !slices.Equal(out, want) {
		t.Errorf("outputs are %v, want %v", out, want)
	}
}

func TestFanOutReturnsNilForEmptyInput(t *testing.T) {
	assertNoExtraGoroutines(t)
	out, err := FanOut(context.Background(), 4, nil, func(_ context.Context, value int) (int, error) {
		t.Error("work ran for an empty input")
		return value, nil
	})
	if err != nil {
		t.Fatalf("FanOut returned %v", err)
	}
	if out != nil {
		t.Errorf("outputs are %v, want nil", out)
	}
}

func TestFanOutCapsWorkersAtTheInputLength(t *testing.T) {
	assertNoExtraGoroutines(t)
	var active, peak atomic.Int32

	_, err := FanOut(context.Background(), 8, []int{1, 2}, func(_ context.Context, value int) (int, error) {
		current := active.Add(1)
		for {
			highest := peak.Load()
			if current <= highest || peak.CompareAndSwap(highest, current) {
				break
			}
		}
		time.Sleep(20 * time.Millisecond)
		active.Add(-1)
		return value, nil
	})
	if err != nil {
		t.Fatalf("FanOut returned %v", err)
	}
	if got := peak.Load(); got > 2 {
		t.Errorf("%d workers ran at the same time, want at most 2", got)
	}
}

func TestFanOutReturnsTheFirstErrorAndNoOutputs(t *testing.T) {
	assertNoExtraGoroutines(t)
	wanted := errors.New("first")

	out, err := FanOut(context.Background(), 1, []int{1, 2, 3}, func(_ context.Context, value int) (int, error) {
		if value == 1 {
			return 0, wanted
		}
		return value, nil
	})
	if !errors.Is(err, wanted) {
		t.Fatalf("FanOut returned %v, want %v", err, wanted)
	}
	if out != nil {
		t.Errorf("outputs are %v, want nil on error", out)
	}
}

func TestFanOutDropsLaterErrors(t *testing.T) {
	assertNoExtraGoroutines(t)
	first := errors.New("first")
	second := errors.New("second")
	release := make(chan struct{})

	_, err := FanOut(context.Background(), 2, []int{1, 2}, func(_ context.Context, value int) (int, error) {
		if value == 1 {
			close(release)
			return 0, first
		}
		<-release
		time.Sleep(10 * time.Millisecond)
		return 0, second
	})
	if !errors.Is(err, first) {
		t.Fatalf("FanOut returned %v, want %v", err, first)
	}
}

func TestFanOutStopsFeedingAfterAnError(t *testing.T) {
	assertNoExtraGoroutines(t)
	var started atomic.Int32
	in := make([]int, 200)
	for index := range in {
		in[index] = index
	}

	_, err := FanOut(context.Background(), 1, in, func(_ context.Context, value int) (int, error) {
		started.Add(1)
		if value == 0 {
			return 0, errors.New("stop here")
		}
		return value, nil
	})
	if err == nil {
		t.Fatal("FanOut returned no error")
	}
	if got := started.Load(); got > 10 {
		t.Errorf("work ran %d times after the first error, want the feeder to stop early", got)
	}
}

func TestFanOutCancelsTheWorkerContextAfterAnError(t *testing.T) {
	assertNoExtraGoroutines(t)
	cancelled := make(chan struct{})

	_, err := FanOut(context.Background(), 2, []int{1, 2}, func(ctx context.Context, value int) (int, error) {
		if value == 1 {
			return 0, errors.New("boom")
		}
		select {
		case <-ctx.Done():
			close(cancelled)
			return 0, ctx.Err()
		case <-time.After(2 * time.Second):
			return value, nil
		}
	})
	if err == nil {
		t.Fatal("FanOut returned no error")
	}
	select {
	case <-cancelled:
	default:
		t.Error("the second worker did not see a cancelled context")
	}
}

// A worker that finished its work still holds an output when another worker
// fails. The collector must keep draining, or that send blocks for ever.
func TestFanOutDrainsAnUndeliveredOutputAfterAnError(t *testing.T) {
	assertNoExtraGoroutines(t)
	ready := make(chan struct{})
	failed := make(chan struct{})

	_, err := FanOut(context.Background(), 2, []int{1, 2}, func(_ context.Context, value int) (int, error) {
		if value == 1 {
			<-ready
			close(failed)
			return 0, errors.New("boom")
		}
		close(ready)
		<-failed
		time.Sleep(20 * time.Millisecond)
		return value, nil
	})
	if err == nil {
		t.Fatal("FanOut returned no error")
	}
}

func TestFanOutReturnsTheContextErrorOnAnExternalCancel(t *testing.T) {
	assertNoExtraGoroutines(t)
	ctx, cancel := context.WithCancel(context.Background())

	_, err := FanOut(ctx, 2, []int{1, 2, 3, 4}, func(ctx context.Context, value int) (int, error) {
		cancel()
		<-ctx.Done()
		return 0, ctx.Err()
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("FanOut returned %v, want context.Canceled", err)
	}
}
