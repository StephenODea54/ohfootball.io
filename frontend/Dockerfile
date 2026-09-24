# Builds the site and serves it.
#
# The build draws every page ahead of time, including one page for each team of the season the API
# considers current. It reads them from the API, so the API has to be answering before this image
# can be built, and VITE_GRAPHQL_URL has to point at it.
#
# That address is used twice. The build reads it to learn which pages to draw, and the same value
# is written into the script the browser runs. So it has to be the address a visitor can reach and
# not a name that resolves only inside the network. A build on the host therefore leaves the host
# and comes back through the proxy, which means the name has to resolve and its certificate has to
# be issued before the first build of the site.
#
# Build from the repository root:
#   docker build -f frontend/Dockerfile --build-arg VITE_GRAPHQL_URL=... -t ohfootball/site .

FROM node:22-alpine AS build

RUN corepack enable

WORKDIR /app

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend ./

ARG VITE_GRAPHQL_URL
ENV VITE_GRAPHQL_URL=${VITE_GRAPHQL_URL}

# A half built site is worse than the one already being served, so the build stops at the first
# failure and the image is never finished.
RUN set -eu; \
    : "${VITE_GRAPHQL_URL:?VITE_GRAPHQL_URL is required}"; \
    pnpm build; \
    # A build that draws its pages when asked, rather than ahead of time, leaves assets here and
    # no pages. Serving that gives a site where every address answers with nothing.
    if [ -z "$(find .output/public -name '*.html' -print -quit 2>/dev/null)" ]; then \
        echo "the build wrote no pages to .output/public" >&2; \
        echo "check the prerender settings in frontend/vite.config.ts" >&2; \
        exit 1; \
    fi

FROM nginx:1.29-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/.output/public /usr/share/nginx/html

EXPOSE 8080
