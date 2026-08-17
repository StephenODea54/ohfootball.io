# Applies every migration to the warehouse, in order.
#
# The warehouse sits in an isolated subnet, so nothing outside the network can reach it. This image
# runs as a task inside the network instead, and the deployment workflow starts it through the AWS
# API rather than by connecting to the database itself.
#
# Every migration is written to be applied again without harm. The files create with IF NOT EXISTS
# and drop a constraint before adding it, so this applies all of them every time and keeps no
# record of what ran. That holds while the migrations stay idempotent. A migration that cannot be
# repeated needs a table recording what has been applied, and this image would have to read it.
#
# Build from the repository root:
#   docker build -f postgres/Dockerfile -t ohfootball/migrate .

FROM postgres:17-alpine

COPY postgres/migrations /migrations

RUN cat > /usr/local/bin/migrate <<'SCRIPT' && chmod +x /usr/local/bin/migrate
#!/bin/sh
# ON_ERROR_STOP makes psql fail on the first bad statement. Without it psql reports the error and
# carries on, and a half applied migration would look like it worked.
set -eu

: "${PGHOST:?PGHOST is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"

for file in /migrations/*.sql; do
    echo "applying $(basename "$file")"
    psql -v ON_ERROR_STOP=1 -f "$file"
done

echo "every migration applied"
SCRIPT

ENTRYPOINT ["/usr/local/bin/migrate"]
