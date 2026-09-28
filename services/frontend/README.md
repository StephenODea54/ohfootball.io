# Site

The site of ohfootball.io. It is an Astro site with React islands, Tailwind CSS, and Intent UI
components.

Every page is drawn from the API when the site is built. The deployed site is files that
Cloudflare Pages serves, and nothing runs to answer a visitor. The browser never calls the API.
Only a few parts of a page run in the browser: the navigation bar, the team finder on the home
page, the leaderboard table, and the rating chart of a team.

The site shows only the current season. Each team of that season has its own page.

## Settings

Copy `.env.example` to `.env` and set the values. An empty value is the same as no value.

| Variable | Used by | Meaning |
| --- | --- | --- |
| `GRAPHQL_URL` | the build and the development server | The address of the GraphQL API. No page or script holds it. |
| `GRAPHQL_API_KEY` | the build and the development server | A secret. The key the API asks for, sent as a bearer token. Leave it unset until the API asks for a key. |
| `PRERENDER_TEAM_LIMIT` | the build | The largest number of team pages to draw. Use it to keep a local build short. Leave it unset for a build that is published. |
| `REGISTRY_TOKEN` | the shadcn command line | The token of the Intent UI registry. Only the command that adds a component reads it. |

## Work on the site

Start the API first. From the root of the repository, `make db-up` starts the database, applies the
migrations, and starts the API on port 8082.

```sh
pnpm install
pnpm dev
```

The development server listens on port 3000. It draws each page from the API when the page is
asked for.

## Check the site

```sh
pnpm typecheck
pnpm test
```

`pnpm typecheck` runs `astro check`, which checks the Astro pages and the React components.
`pnpm test` runs the unit tests with Vitest. The tests need no API and no build. They replace the
settings that Astro gives the build with the fixed values in `src/test/astro-env-server.ts`.

From the root of the repository, `make site-check` runs both, and `make site-test` checks
`make pages` and the rules in `public/_headers`. `make test` and the pre-commit hook run both
targets. On a machine without pnpm, `make site-check` prints a message and checks nothing. CI
runs the same checks.

## Build the site

```sh
pnpm build
make pages
```

The build reads the API at `GRAPHQL_URL`, so the API must answer and the warehouse must hold data.
The build stops at the first page that fails to draw. It writes the site to `dist`, one file for
each address, such as `leaderboard.html` for `/leaderboard`.

`make pages` makes `dist` ready for Cloudflare Pages. It stops when the build wrote no pages, no
assets, no `_headers`, or no `404.html`, or when `404.html` is a copy of the home page. It stops
when a page is a directory, because Pages would send each such address through a redirect. It stops
when a file names the API. When `GRAPHQL_API_KEY` is set, it stops when the key is shorter than 16
characters, and when a file holds the key. It prints only the names of those files. It then writes
`assets/404.html`, a line of plain text.

Pages answers an address that has no page with the nearest `404.html` and the status 404. At the
root, that is the not-found page that `src/pages/404.astro` draws. Under `assets/`, it is the line
of plain text. `public/_headers` sets how long a browser keeps each file.

To see how Pages answers, serve the directory with Wrangler:

```sh
npx wrangler pages dev dist
```

## Publish the site

`.github/workflows/site.yml` runs the same build against `https://api.ohfootball.io/graphql` and
sends `dist` to Cloudflare Pages. It starts on a push to main that changes the site, and when the
weekly run asks for it. `docs/architecture.md` describes the workflow and its settings.
