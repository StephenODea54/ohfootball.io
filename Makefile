.PHONY: build test vet fmt hooks sqlc-generate sqlc-vet db-up db-down db-logs \
	infra-install infra-test infra-synth infra-diff db-migrate \
	dbt dbt-debug dbt-parse dbt-run dbt-test dbt-build dbt-docs-generate dbt-docs-serve \
	elo-build elo-test mlflow-up mlflow-down elo-run elo-sweep \
	dataset-build dataset-test dataset-export

DBT := docker compose run --rm dbt

build:
	$(MAKE) -C services/scraper build
	$(MAKE) -C services/api build

test:
	$(MAKE) -C services/scraper test
	go -C pkg/database test ./...
	$(MAKE) -C services/api test
	$(MAKE) -C services/elo test
	$(MAKE) -C services/dataset test

vet:
	$(MAKE) -C services/scraper vet
	go -C pkg/database vet ./...
	$(MAKE) -C services/api vet
	$(MAKE) -C services/elo vet
	$(MAKE) -C services/dataset vet

fmt:
	$(MAKE) -C services/scraper fmt
	$(MAKE) -C services/api fmt
	gofmt -w pkg/database/*.go pkg/database/db/*.go

hooks:
	git config core.hooksPath .githooks

sqlc-generate:
	go -C pkg/database run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.30.0 generate

sqlc-vet:
	go -C pkg/database run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.30.0 vet

db-up:
	docker compose up -d --wait

db-down:
	docker compose down

# Apply one migration to a database that already holds data.
#
# Compose mounts postgres/migrations into the entry point directory of the
# image, which runs a file one time only, when the volume is created. A
# migration added later never reaches a database that already exists, so an
# operator applies it here. Name the file, for example:
# make db-migrate FILE=postgres/migrations/004_ohhsfbdb_raw.sql
db-migrate:
	@test -n "$(FILE)" || { echo "name the migration with FILE=postgres/migrations/..."; exit 1; }
	docker compose exec -T postgres psql -v ON_ERROR_STOP=1 \
		-U im_batman -d ohfootball < $(FILE)

# Pass any dbt command or selector with, for example:
# make dbt ARGS="run --select stg_games"
dbt:
	$(DBT) $(ARGS)

dbt-debug:
	$(DBT) debug

dbt-parse:
	$(DBT) parse

dbt-run:
	$(DBT) run

dbt-test:
	$(DBT) test

dbt-build:
	$(DBT) build

dbt-docs-generate:
	$(DBT) docs generate

dbt-docs-serve:
	docker compose run --rm --service-ports dbt docs serve --host 0.0.0.0 --port 8081

elo-build:
	docker compose build elo

elo-test:
	$(MAKE) -C services/elo test

mlflow-up:
	docker compose --profile tools up -d --wait mlflow

mlflow-down:
	docker compose --profile tools stop mlflow

elo-run:
	docker compose run --rm elo run $(ARGS)

elo-sweep:
	docker compose run --rm elo sweep $(ARGS)

dataset-build:
	docker compose build dataset

dataset-test:
	$(MAKE) -C services/dataset test

# Writes the files a publication would send, and sends nothing. The files land in
# services/dataset/export, which Git ignores.
dataset-export:
	docker compose run --rm dataset export --directory /export $(ARGS)

# The stacks keep their own dependencies, so they are not part of the top level test target. A
# synth reads no account and no network, so it runs without credentials.
infra-install:
	cd infra && pnpm install

infra-test:
	cd infra && pnpm test

infra-synth:
	cd infra && pnpm synth

infra-diff:
	cd infra && pnpm diff
