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
#   docker build -f services/frontend/Dockerfile --build-arg VITE_GRAPHQL_URL=... -t ohfootball/site .

FROM node:22-alpine AS build

# Corepack installs the pnpm version that the packageManager field of package.json names. The
# image, the checks and a developer machine therefore install with the same pnpm.
RUN corepack enable

WORKDIR /app

# pnpm-workspace.yaml names the packages that may run an install script. The install reads it,
# so it is copied in with the lockfile.
COPY services/frontend/package.json services/frontend/pnpm-lock.yaml \
    services/frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY services/frontend ./

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
        echo "check the prerender settings in services/frontend/vite.config.ts" >&2; \
        exit 1; \
    fi

FROM nginx:1.29-alpine

COPY services/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/.output/public /usr/share/nginx/html

EXPOSE 8080

# The host waits for this check to pass before it counts a new container as running. With the
# update order set to start-first, the old container answers until then, so a deploy does not
# stop the site. nginx listens on IPv4 only, so the check names 127.0.0.1 and not localhost.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
