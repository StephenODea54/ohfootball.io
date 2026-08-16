# Builds the site and writes it to the bucket the distribution reads.
#
# The build runs after the API has been published, so the pages it draws carry the ratings of the
# run that just finished. Nothing here serves anything. It writes files and exits.
#
# The build draws every page ahead of time, including one page for each season a program has
# played. It reads them from the API, so VITE_GRAPHQL_URL has to point at the API that was
# published just before this runs.
#
# Build from the repository root:
#   docker build -f frontend/Dockerfile -t ohfootball/site .

FROM node:22-alpine

RUN apk add --no-cache aws-cli
RUN corepack enable

WORKDIR /app

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend ./

RUN cat > /usr/local/bin/publish <<'SCRIPT' && chmod +x /usr/local/bin/publish
#!/bin/sh
# A half written site is worse than an old one, so the first failure stops the run.
set -eu

: "${SITE_BUCKET:?SITE_BUCKET is required}"
: "${VITE_GRAPHQL_URL:?VITE_GRAPHQL_URL is required}"

pnpm build

output=.output/public

# A build that draws its pages when asked, rather than ahead of time, leaves assets here and no
# pages. Publishing that gives a site where every address answers with nothing.
if [ -z "$(find "$output" -name '*.html' -print -quit 2>/dev/null)" ]; then
    echo "the build wrote no pages to ${output}" >&2
    echo "check the prerender settings in frontend/vite.config.ts" >&2
    exit 1
fi

# Everything the build names with a hash may be held forever, because a change to the file changes
# its name. Everything else has to be checked on each visit, or a visitor keeps reading yesterday.
aws s3 sync "$output"/ "s3://${SITE_BUCKET}/" \
    --delete \
    --exclude "*.html" \
    --cache-control "public,max-age=31536000,immutable"

aws s3 sync "$output"/ "s3://${SITE_BUCKET}/" \
    --delete \
    --exclude "*" \
    --include "*.html" \
    --cache-control "public,max-age=0,must-revalidate"

echo "wrote the site to s3://${SITE_BUCKET}/"
SCRIPT

ENTRYPOINT ["/usr/local/bin/publish"]
