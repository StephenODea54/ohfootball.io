.PHONY: build test vet fmt sqlc-generate sqlc-vet db-up db-down db-logs \
	dbt dbt-debug dbt-parse dbt-run dbt-test dbt-build dbt-docs-generate dbt-docs-serve

DBT := docker compose run --rm dbt

build:
	$(MAKE) -C services/scraper build

test:
	$(MAKE) -C services/scraper test
	go -C pkg/database test ./...

vet:
	$(MAKE) -C services/scraper vet
	go -C pkg/database vet ./...

fmt:
	$(MAKE) -C services/scraper fmt
	gofmt -w pkg/database/*.go pkg/database/db/*.go

sqlc-generate:
	go -C pkg/database run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.30.0 generate

sqlc-vet:
	go -C pkg/database run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.30.0 vet

db-up:
	docker compose up -d --wait

db-down:
	docker compose down

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
