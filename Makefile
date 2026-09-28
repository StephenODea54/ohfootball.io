.PHONY: build test vet fmt hooks db-up db-down db-logs db-migrate db-baseline \
	dbt dbt-debug dbt-parse dbt-run dbt-test dbt-build dbt-docs-generate dbt-docs-serve \
	elo-build elo-test mlflow-up mlflow-down elo-run elo-sweep \
	dataset-build dataset-test dataset-export \
	pipeline pipeline-build pipeline-test postgres-test site-test site-check

DBT := docker compose run --rm dbt

build:
	$(MAKE) -C services/scraper build
	$(MAKE) -C services/api build

test:
	$(MAKE) -C services/scraper test
	$(MAKE) -C services/api test
	$(MAKE) -C services/elo test
	$(MAKE) -C services/dataset test
	$(MAKE) pipeline-test
	$(MAKE) site-test
	$(MAKE) site-check
	$(MAKE) postgres-test

vet:
	$(MAKE) -C services/scraper vet
	$(MAKE) -C services/api vet
	$(MAKE) -C services/elo vet
	$(MAKE) -C services/dataset vet
	python3 -m compileall -q infra/pipeline/tests infra/postgres services/frontend/tests

fmt:
	$(MAKE) -C services/scraper fmt
	$(MAKE) -C services/api fmt

hooks:
	git config core.hooksPath .githooks

db-up:
	docker compose up -d --wait

db-down:
	docker compose down

# Applies every migration that the local database does not hold yet.
#
# The migrate service of the compose file runs sustained. sustained keeps a record of each
# migration it applied in the table sustained_migrations, so it applies only the new ones.
# make db-up runs the same service before the API starts, so this target is for a migration
# written while the database is up.
db-migrate:
	docker compose run --rm migrate

# Records the migrations as applied without running them.
#
# A volume created before sustained applied the migrations already holds their tables, because
# the database image ran the files when it created the volume. sustained has no record of them
# and tries to make the tables again, so make db-up fails. Run this target one time on such a
# volume and then run make db-up. It records every migration up to and including BASELINE. If
# the volume does not hold the last migration, name the last one that it holds, for example:
# make db-baseline BASELINE=004_ohhsfbdb_raw
BASELINE ?= 005_ratings_cover_every_season
db-baseline:
	docker compose run --rm migrate sustained baseline $(BASELINE)

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

pipeline-build:
	docker compose build pipeline

# Runs one target of the weekly run inside the pipeline image, which is what the host does on a
# schedule. Name the target, for example:
# make pipeline ARGS=rate
pipeline:
	docker compose run --rm pipeline make $(ARGS)

# Checks the target that asks GitHub to build the site. It needs no image and no database, so
# it is part of the top level test target.
pipeline-test:
	python3 -m unittest discover -s infra/pipeline/tests

# Checks the target that makes the build of the site ready for Cloudflare Pages, and the headers
# that Pages sends. It needs no build and no API, so it is part of the top level test target.
site-test:
	python3 -m unittest discover -s services/frontend/tests

# Type checks the site and runs its unit tests. They need Node and the packages of the site, but no
# build and no API. A machine without pnpm skips them, so the other checks still run there. The
# frontend job in CI runs them.
site-check:
	@if command -v pnpm >/dev/null 2>&1; then \
		ASTRO_TELEMETRY_DISABLED=1 pnpm -C services/frontend typecheck && \
		pnpm -C services/frontend test; \
	else \
		echo "site-check: pnpm is not installed, so the site is not checked" >&2; \
	fi

# Checks the files that the migrate image holds. The tests need no image, no database and no
# package outside the standard library, so they are part of the top level test target.
postgres-test:
	PYTHONPATH=infra/postgres python3 -m unittest discover -s infra/postgres/tests
