.PHONY: build test vet fmt hooks db-up db-down db-logs db-migrate db-baseline \
	tools lint-tools lint lint-go lint-python lint-sql fmt-go fmt-python fmt-sql \
	site-lint site-fmt doctor \
	dbt dbt-debug dbt-parse dbt-run dbt-test dbt-build dbt-docs-generate dbt-docs-serve \
	rating-build rating-test rating-evaluate \
	dataset-build dataset-test dataset-export \
	pipeline pipeline-build pipeline-test postgres-test site-test site-check

DBT := docker compose run --rm dbt

# The versions of the tools that lint and format the Python and the SQL. The hook and CI run these
# versions. Dependabot does not read them, so raise them by hand.
RUFF_VERSION := 0.16.9
SQLFLUFF_VERSION := 4.3.0

# The command that installs a tool. uv keeps each tool in an environment of its own and puts its
# command in ~/.local/bin. CI sets it to pip install, because the runner is used one time.
TOOL_INSTALL ?= uv tool install

build:
	$(MAKE) -C services/scraper build
	$(MAKE) -C services/api build

test:
	$(MAKE) -C services/scraper test
	$(MAKE) -C services/api test
	$(MAKE) -C services/rating test
	$(MAKE) -C services/dataset test
	$(MAKE) pipeline-test
	$(MAKE) site-test
	$(MAKE) site-check
	$(MAKE) postgres-test

vet:
	$(MAKE) -C services/scraper vet
	$(MAKE) -C services/api vet
	$(MAKE) -C services/rating vet
	$(MAKE) -C services/dataset vet
	python3 -m compileall -q infra/pipeline/tests infra/postgres services/frontend/tests

# Installs the tools that make lint and make fmt run for the Python and the SQL.
tools:
	$(TOOL_INSTALL) ruff==$(RUFF_VERSION)
	$(TOOL_INSTALL) sqlfluff==$(SQLFLUFF_VERSION)

# Stops with a message when a tool is missing or has a different version. The fix is one command,
# so the check does not skip the tool the way site-check skips a machine without pnpm.
lint-tools:
	@for pair in ruff:$(RUFF_VERSION) sqlfluff:$(SQLFLUFF_VERSION); do \
		tool=$${pair%%:*}; want=$${pair#*:}; \
		command -v $$tool >/dev/null 2>&1 || { \
			echo "$$tool is not installed. Run: make tools" >&2; exit 1; }; \
		have=$$($$tool --version | awk '{print $$NF}'); \
		[ "$$have" = "$$want" ] || { \
			echo "$$tool is $$have and not $$want. Run: make tools" >&2; exit 1; }; \
	done

# Checks the format and the lint rules of each language and changes nothing. make fmt fixes what
# it can.
lint: lint-go lint-python lint-sql site-lint

lint-go:
	@unformatted=$$(gofmt -l $$(git ls-files '*.go')); \
	if [ -n "$$unformatted" ]; then \
		printf 'These files are not formatted:\n%s\n' "$$unformatted" >&2; exit 1; \
	fi

lint-python: lint-tools
	ruff format --check .
	ruff check .

# The migrations are linted and never fixed. See infra/postgres/.sqlfluff.
lint-sql: lint-tools
	sqlfluff lint services/analytics infra/postgres/migrations

fmt: fmt-go fmt-python fmt-sql site-fmt

fmt-go:
	$(MAKE) -C services/scraper fmt
	$(MAKE) -C services/api fmt

fmt-python: lint-tools
	ruff format .
	ruff check --fix .

fmt-sql: lint-tools
	sqlfluff fix services/analytics

# Lints the site and fixes its format. They follow the rule of site-check, so a machine without
# pnpm skips them. They stop when pnpm is installed but the packages of the site are not.
SITE_BIOME := services/frontend/node_modules/.bin/biome

site-lint:
	@if ! command -v pnpm >/dev/null 2>&1; then \
		echo "site-lint: pnpm is not installed, so the site is not linted" >&2; \
	elif [ ! -x $(SITE_BIOME) ]; then \
		echo "site-lint: the packages of the site are missing. Run: pnpm -C services/frontend install" >&2; \
		exit 1; \
	else \
		pnpm -C services/frontend lint; \
	fi

site-fmt:
	@if ! command -v pnpm >/dev/null 2>&1; then \
		echo "site-fmt: pnpm is not installed, so the site is not formatted" >&2; \
	elif [ ! -x $(SITE_BIOME) ]; then \
		echo "site-fmt: the packages of the site are missing. Run: pnpm -C services/frontend install" >&2; \
		exit 1; \
	else \
		pnpm -C services/frontend fmt; \
	fi

hooks:
	git config core.hooksPath .githooks

# Reports which of the tools that the repository needs are missing, and whether python3 is the
# version that .python-version names. It stops with an error when a tool is missing.
doctor:
	@missing=0; \
	for tool in go python3 uv ruff sqlfluff node pnpm docker; do \
		if command -v $$tool >/dev/null 2>&1; then \
			printf 'found    %s\n' "$$tool"; \
		else \
			printf 'missing  %s\n' "$$tool" >&2; missing=1; \
		fi; \
	done; \
	want=$$(cat .python-version); \
	have=$$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null); \
	if [ "$$have" != "$$want" ]; then \
		printf 'python3 is %s and not %s. Run: uv venv && . .venv/bin/activate\n' \
			"$${have:-missing}" "$$want" >&2; \
	fi; \
	exit $$missing

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
# volume and then run make db-up. It records every migration up to and including BASELINE. The
# default is the last migration made before sustained. If the volume does not hold it, name the
# last one that it holds, for example:
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

rating-build:
	docker compose build rating

rating-test:
	$(MAKE) -C services/rating test

# Scores the margin rating on past seasons of the local warehouse and prints the result.
rating-evaluate:
	docker compose run --rm rating evaluate $(ARGS)

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
