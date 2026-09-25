# Site

The site of ohfootball.io. It is a TanStack Start application with React, Tailwind CSS, and
Intent UI components.

Every page of the current season is drawn when the site is built. The deployed site is files that
nginx serves, and nothing runs to answer a visitor. A browser asks the API directly for anything
that was not drawn ahead of time.

## Settings

Copy `.env.example` to `.env` and set the values.

| Variable | Used by | Meaning |
| --- | --- | --- |
| `VITE_GRAPHQL_URL` | the build and the browser | The address of the GraphQL API. |
| `PRERENDER_TEAM_LIMIT` | the build | The largest number of team pages to draw. Use it to keep a local build short. Leave it unset for a build that is published. |
| `REGISTRY_TOKEN` | the shadcn command line | The token of the Intent UI registry. Only the command that adds a component reads it. |

## Work on the site

Start the API first. From the root of the repository, `make db-up` starts the database, applies the
migrations, and starts the API on port 8082.

```sh
pnpm install
pnpm dev
```

The development server listens on port 3000. It draws each page when the page is asked for.

## Check the site

```sh
pnpm typecheck
```

The checks in CI run the same command.

## Build the site

```sh
pnpm build
```

The build reads the API at `VITE_GRAPHQL_URL` to learn which team pages to draw, so the API must
answer and the warehouse must hold data. The build stops at the first page that fails to draw. It
writes the pages to `.output/public`.

The image in `Dockerfile` runs the same build and serves the pages with nginx on port 8080. Build
it from the root of the repository:

```sh
docker build -f services/frontend/Dockerfile \
  --build-arg VITE_GRAPHQL_URL=https://api.ohfootball.io/graphql \
  -t ohfootball/site .
```

`docs/architecture.md` describes how the host builds and serves the site.
