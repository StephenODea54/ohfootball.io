# Holds everything the weekly run calls.
#
# The host runs a scheduled job by starting a command inside a container that is already running,
# so this image has to stay up between runs. It therefore does nothing until it is asked to, and
# the command it is asked for is a target of the Makefile beside this file.
#
# One image rather than one image per step, because a scheduled job on this host reaches a running
# container and not a container it starts. Five idle containers would cost five times as much to
# hold up for the same work.
#
# Build from the repository root:
#   docker build -f infra/pipeline/Dockerfile -t ohfootball/pipeline .

FROM golang:1.27-alpine AS build

WORKDIR /src
COPY services/scraper ./services/scraper

WORKDIR /src/services/scraper
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
    -o /out/joe-eitel ./cmd/joe-eitel
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
    -o /out/ohhsfbdb ./cmd/ohhsfbdb

FROM python:3.12-slim

ARG DBT_CORE_VERSION=1.12.0
ARG DBT_POSTGRES_VERSION=1.11.0

# git is read by dbt when it resolves a package. curl asks GitHub to build the site. make runs
# the targets. The PostgreSQL client lets an operator read or change the warehouse by hand. The
# migrations are applied by the image in infra/postgres.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        curl \
        git \
        make \
        postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir \
    "dbt-core==${DBT_CORE_VERSION}" \
    "dbt-postgres==${DBT_POSTGRES_VERSION}"

COPY services/rating/pyproject.toml services/rating/README.md /tmp/rating/
COPY services/rating/src /tmp/rating/src
RUN pip install --no-cache-dir /tmp/rating && rm -rf /tmp/rating

COPY services/dataset/pyproject.toml services/dataset/README.md /tmp/dataset/
COPY services/dataset/src /tmp/dataset/src
RUN pip install --no-cache-dir /tmp/dataset && rm -rf /tmp/dataset

COPY services/recruiting/pyproject.toml services/recruiting/README.md /tmp/recruiting/
COPY services/recruiting/src /tmp/recruiting/src
RUN pip install --no-cache-dir /tmp/recruiting && rm -rf /tmp/recruiting

COPY --from=build /out/joe-eitel /usr/local/bin/joe-eitel
COPY --from=build /out/ohhsfbdb /usr/local/bin/ohhsfbdb

COPY services/analytics ./analytics
COPY infra/pipeline/Makefile ./Makefile

# dbt reads its connection settings from here, and every setting in that file is read from the
# environment.
ENV DBT_PROFILES_DIR=/app/analytics

# The container holds itself up so a scheduled job has something to run a command inside. It
# starts nothing and listens on no port.
#
# The command is process 1 in its container. Process 1 ignores a signal that has no handler, so a
# plain sleep would make the host wait the full stop period on each deploy and then kill it. The
# shell sets a handler for the stop signal, waits on the sleep, and stops with success when the
# signal arrives.
CMD ["sh", "-c", "trap 'exit 0' TERM INT; sleep infinity & wait"]
