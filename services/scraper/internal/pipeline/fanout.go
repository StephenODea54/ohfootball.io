// Package pipeline holds the scrape stages and the worker pool that runs them.
package pipeline

import (
	"context"
	"sync"
)

// FanOut runs work over every item of in, with at most workers goroutines.
//
// The first error stops the run. FanOut cancels the context that it gives to
// the workers, waits for all of them to return, and then returns that first
// error with a nil slice. It does not collect the other errors.
//
// On success FanOut returns one output for each input. The order of the
// outputs is not the order of the inputs.
func FanOut[In, Out any](ctx context.Context, workers int, in []In,
	work func(context.Context, In) (Out, error)) ([]Out, error) {
	if len(in) == 0 {
		return nil, nil
	}

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	jobs := make(chan In)
	results := make(chan Out)

	var (
		once     sync.Once
		firstErr error
		group    sync.WaitGroup
	)

	for range min(workers, len(in)) {
		group.Add(1)
		go func() {
			defer group.Done()
			for item := range jobs {
				output, err := work(ctx, item)
				if err != nil {
					once.Do(func() { firstErr = err })
					cancel()
					continue
				}
				// This send has no escape on cancel. The collector below
				// drains until close, so the send always completes.
				results <- output
			}
		}()
	}

	go func() {
		defer close(jobs)
		for _, item := range in {
			select {
			case jobs <- item:
			case <-ctx.Done():
				return
			}
		}
	}()

	// The wait must happen here and not in the body below. The workers send on
	// an unbuffered channel, so a wait that runs before the collector would
	// block every worker and never return.
	go func() {
		group.Wait()
		close(results)
	}()

	outputs := make([]Out, 0, len(in))
	for output := range results {
		outputs = append(outputs, output)
	}

	if firstErr != nil {
		return nil, firstErr
	}
	return outputs, nil
}
