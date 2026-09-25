# Applies the migrations to the warehouse and then stays up.
#
# The warehouse does not answer from outside the host, so the migrations run from a container
# beside it. The host restarts a container that stops. This container therefore applies every
# pending migration when it starts and then waits. A migration that fails stops the container,
# and each restart writes the failure to the log again.
#
# sustained keeps a record of each migration it applied, in the table sustained_migrations. A
# second start applies nothing. Do not change a migration after it is applied, not even a
# comment. sustained reads the change as an edit and refuses to run. Write a new migration.
#
# The other applications do not wait for this one. A migration must work with the code that
# runs before it and with the code that runs after it.
#
# A warehouse whose tables were made before sustained applied the migrations has no record of
# them. Record them one time, without running them, with:
#   sustained baseline 005_ratings_cover_every_season
#
# The versions are pinned. A new release of sustained can change how it reads a migration, so
# read its release notes before a change here.
#
# Build from the repository root:
#   docker build -f infra/postgres/Dockerfile -t ohfootball/migrate .

FROM python:3.12-slim

ARG SUSTAINED_VERSION=2.25.0
ARG PSYCOPG_VERSION=3.3.6

# Python writes nothing beside the code, and each line of the log reaches the host at once. The
# container stays up after a run, so a line held in a buffer would never reach the log.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN pip install --no-cache-dir \
    "sustained==${SUSTAINED_VERSION}" \
    "psycopg[binary]==${PSYCOPG_VERSION}"

COPY infra/postgres/sustained_config.py infra/postgres/migrate.py ./
COPY infra/postgres/migrations ./migrations

USER nobody

CMD ["python", "migrate.py", "--hold"]
