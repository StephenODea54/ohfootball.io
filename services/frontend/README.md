# Site

The site of ohfootball.io. It is a TanStack Start application with React, Tailwind CSS, and
Intent UI components.

Every page of the current season is drawn when the site is built. The deployed site is files that
Cloudflare Pages serves, and nothing runs to answer a visitor. A browser asks the API directly for
anything that was not drawn ahead of time.

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

From the root of the repository, `make site-test` checks `make pages` and the rules in
`public/_headers`. The checks in CI run both.

## Build the site

```sh
pnpm build
make pages
```

The build reads the API at `VITE_GRAPHQL_URL` to learn which team pages to draw, so the API must
answer and the warehouse must hold data. The build stops at the first page that fails to draw. It
writes the pages to `.output/public`, one file for each address, such as `leaderboard.html` for
`/leaderboard`.

`make pages` makes that directory ready for Cloudflare Pages. It stops when the build wrote no
pages, or when a page is a directory, because Pages would send each such address through a
redirect. It then writes `404.html`, a copy of the home page, and `assets/404.html`, a line of
plain text. Pages answers an address that has no page with the nearest of the two and the status
404. The browser then draws the page from the API. `public/_headers` sets how long a browser keeps
each file.

To see how Pages answers, serve the directory with Wrangler:

```sh
npx wrangler pages dev .output/public
```

## Publish the site

`.github/workflows/site.yml` runs the same build against `https://api.ohfootball.io/graphql` and
sends `.output/public` to Cloudflare Pages. It starts on a push to main that changes the site, and
when the weekly run asks for it. `docs/architecture.md` describes the workflow and its settings.
