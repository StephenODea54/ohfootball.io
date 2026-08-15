// Command snapshot writes the marts of the warehouse to a single SQLite file. The deployed API
// reads that file, so the pipeline runs this once per run and ships the result beside the binary.
package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/StephenODea54/services/api/internal/config"
	"github.com/StephenODea54/services/api/internal/store"
	"github.com/jackc/pgx/v5"
	_ "modernc.org/sqlite"
)

const defaultDatabaseURL = "postgres://im_batman:shhhhhhhhh@localhost:5432/ohfootball?sslmode=disable"

func main() {
	output := flag.String("out", "ohfootball.db", "path of the snapshot to write")
	flag.Parse()

	if err := run(*output); err != nil {
		slog.Error("the snapshot was not written", "error", err)
		os.Exit(1)
	}
}

func run(output string) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// A snapshot describes one moment, so it is always written from nothing. Removing an earlier
	// file keeps a rerun from adding its rows to the rows already there.
	if err := os.Remove(output); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove the earlier snapshot: %w", err)
	}

	warehouse, err := pgx.Connect(ctx, config.String("DATABASE_URL", defaultDatabaseURL))
	if err != nil {
		return fmt.Errorf("connect to the warehouse: %w", err)
	}
	defer warehouse.Close(ctx)

	snapshot, err := sql.Open("sqlite", output)
	if err != nil {
		return fmt.Errorf("create the snapshot: %w", err)
	}
	defer snapshot.Close()

	// Nothing reads the file while it is being written, and a failed run throws the file away, so
	// the write ahead journal and the flush after every write earn nothing here.
	if _, err := snapshot.ExecContext(ctx, `PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF`); err != nil {
		return fmt.Errorf("set the snapshot pragmas: %w", err)
	}
	if _, err := snapshot.ExecContext(ctx, store.SQLiteSchema); err != nil {
		return fmt.Errorf("apply the snapshot schema: %w", err)
	}

	started := time.Now()
	for _, source := range tables {
		written, err := copyTable(ctx, warehouse, snapshot, source)
		if err != nil {
			return err
		}
		if written == 0 {
			return fmt.Errorf("%s is empty, which no season of the marts produces", source.name)
		}
		slog.Info("table written", "table", source.name, "rows", written)
	}

	// ANALYZE records how the values of each indexed column are spread. The planner reads that when
	// it chooses an index, and the file is read far more often than it is written.
	if _, err := snapshot.ExecContext(ctx, `ANALYZE`); err != nil {
		return fmt.Errorf("analyze the snapshot: %w", err)
	}
	// VACUUM rewrites the file without the free space that the inserts left behind. The whole file
	// ships in the deployment package, so its size is worth the extra pass.
	if _, err := snapshot.ExecContext(ctx, `VACUUM`); err != nil {
		return fmt.Errorf("vacuum the snapshot: %w", err)
	}

	info, err := os.Stat(output)
	if err != nil {
		return fmt.Errorf("measure the snapshot: %w", err)
	}
	slog.Info(
		"snapshot written",
		"path", output,
		"megabytes", info.Size()/(1024*1024),
		"seconds", int(time.Since(started).Seconds()),
	)
	return nil
}
