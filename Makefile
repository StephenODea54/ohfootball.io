.PHONY: build test vet fmt sqlc-generate sqlc-vet db-up db-down db-logs \
	dbt dbt-debug dbt-parse dbt-run dbt-test dbt-build dbt-docs-generate dbt-docs-serve \
	predictor-build predictor-test mlflow-up mlflow-down elo-run elo-sweep

DBT := docker compose run --rm dbt

build:
	$(MAKE) -C services/scraper build
	$(MAKE) -C services/api build

test:
	$(MAKE) -C services/scraper test
	go -C pkg/database test ./...
	$(MAKE) -C services/api test
	$(MAKE) -C services/predictor test

vet:
	$(MAKE) -C services/scraper vet
	go -C pkg/database vet ./...
	$(MAKE) -C services/api vet
	$(MAKE) -C services/predictor vet

fmt:
	$(MAKE) -C services/scraper fmt
	$(MAKE) -C services/api fmt
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

predictor-build:
	docker compose build predictor

predictor-test:
	$(MAKE) -C services/predictor test

mlflow-up:
	docker compose --profile tools up -d --wait mlflow

mlflow-down:
	docker compose --profile tools stop mlflow

elo-run:
	docker compose run --rm predictor run $(ARGS)

elo-sweep:
	docker compose run --rm predictor sweep $(ARGS)
