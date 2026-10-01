# Site

The site of ohfootball.io. It is an Astro site with React islands, Tailwind CSS, and Intent UI
components.

Every page is drawn from the API when the site is built. The deployed site is files that
Cloudflare Pages serves, and nothing runs to answer a visitor. The browser never calls the API.
Only a few parts of a page run in the browser: the navigation bar, the team finder on the home
page, the leaderboard table, the rating chart and the program history of a team, the charts and
tables of the Accuracy page, and the compare page.

The site shows the teams of the current season only. Each team of that season has its own page.
The Accuracy page scores every season.

The page `/accuracy` grades the predictions against the results: the headline scores, the last
week with results, the weeks of the current season, and the scores by season, by phase, and by
confidence, with the biggest upsets and the worst weeks. The Hall Of Fame lists the ten biggest
games in which the model called the final margin exactly, and the report of the last week lists
the exact margins of that week. A margin is exact when the margin that the model expected for the
winner, rounded as the page shows it, is the final margin. The build reads it from one query
of the API. `FIRST_SCORED_SEASON` in `src/features/accuracy/scored-seasons.ts` is 2000, the first
season of every number but the chart by season. From 2000 on, the scores come from one source and
every season has overtime. `FIRST_CHART_SEASON` is 1973, because 1972 is the first season of the
data and its predictions say little. The text of the page must not name the API, because
`make pages` refuses a page other than `/api` that names it.

The page `/api` tells people how to call the public API: the endpoint, the contact that each
request names, the rate limits, the errors, a curl example, the playground, and the Data page and
the Kaggle dataset for bulk data. It is drawn when the site is built, and its content runs no script. Only the
navigation bar runs in the browser, as on every page. It is the only page that names the API. `src/features/api-docs/api.ts` holds the address of the API, and only that page
imports it. Do not put the address in `src/config/paths.ts`, because the navigation bar runs in the
browser and imports that file.

The page `/data` tells people how to download the weekly zip of the data from
`data.ohfootball.io`: the five files, a Python example, and the dated copies. The columns of each
file are described in the `README.md` of the zip, so the page does not list them. The page holds no
date and no row count, because the site is built before the weekly run uploads the zip. Its content
runs no script. `src/features/data/data.ts` holds the addresses, and only that page imports it.

## The compare page

The page `/compare` shows two schools on one chart, season by season, with a table of the same
data and the record of the two schools against each other. The pair is in the query string, as
`/compare?a=1624&b=306`. Each side is the `sourceId` of a school, which stays the same from one
season to the next, so a shared link keeps working after the weekly build. A side is read only when
it is a number of up to 20 digits and names a school that has a page. The page says which ids it
left out. When a school is chosen, the page writes the new pair into the address with
`history.replaceState`, so the back button leaves the page in one step. Search engines see one
address, because the canonical link of every pair is `/compare`.

The page holds the list of schools. It holds no rating. When a school is chosen, the browser loads
the history file of the school from the site, such as `/programs/1624.json`. The build writes one
history file for every team that has a page, from the `program` query of the API. A file holds the
rating of the school at the end of each season, and its games against Ohio teams. The point of the
season in progress is its newest weekly rating, so the page labels it "so far". A history file is
not a page, so the sitemap leaves it out, and `make pages` does not count it. A school whose
`sourceId` is not safe in a file name gets no file, and the build writes a warning.

A team page links to the compare page with the school as the first side. It also links to each of
its rivalries in `src/features/compare/rivalries.ts`, such as `/compare?a=1258&b=1552` for Piqua and
Troy. To add a rivalry, add a pair of `sourceId` values. A team page shows the link of a rivalry
only when both schools have a page. A comparison has no address of its own other than the query
string.

`PRERENDER_TEAM_LIMIT` also limits the history files and the list of schools on the compare page.
A small limit can hide a rivalry link.

Two schools that merged have different `sourceId` values, and the page does not join them. A school
that did not play the current season has no page and no history file, so it cannot be compared.

## Settings

Copy `.env.example` to `.env` and set the values. An empty value is the same as no value.

| Variable | Used by | Meaning |
| --- | --- | --- |
| `GRAPHQL_URL` | the build and the development server | The address of the GraphQL API. No page or script holds it. |
| `GRAPHQL_API_KEY` | the build and the development server | A secret. The build key, sent as a bearer token. It must equal `SITE_BUILD_KEY` of the API, which then lets the build skip the contact rule and the rate limits. Without it, a full build gets 429. |
| `PRERENDER_TEAM_LIMIT` | the build | The largest number of team pages and history files to draw. Use it to keep a local build short. Leave it unset for a build that is published. |
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

The API limits each address to 60 requests a minute, with up to 20 at once, and a build or a quick
walk through the pages can go over it. To skip the limits, start the compose stack with `SITE_BUILD_KEY` set in the shell,
and set the same value as `GRAPHQL_API_KEY` in `.env`. Use at least 16 characters.

## Team logos

The site serves a logo for each team from `public/logos`. The name of each file is the source
identifier of the team, which the API gives as `sourceId`, and the size in pixels. For example,
`842-80.webp` is the small logo of La Salle. Each team that has a logo has two square WebP files: 80
pixels for rows and cards, and 192 pixels for the top of a team page.

`src/features/teams/utils/logo-manifest.json` lists the teams that have a logo, so that the site
asks only for files that exist. A team that is not in the list shows its initials. To add a logo,
add both files and add the source identifier to the list.

The logos are marks of their schools. The license of this repository does not cover them.

## Check the site

```sh
pnpm lint
pnpm typecheck
pnpm test
```

`pnpm lint` checks the format and the lint rules and changes nothing. `pnpm fmt` fixes what it
can. Biome lints and formats the TypeScript and the JSON, and sorts the imports. Prettier with
`prettier-plugin-astro` formats the Astro pages, because Biome formats only the frontmatter of an
Astro file. The two tools share one style: double quotes, no semicolons, trailing commas, and 100
columns. `biome.json` holds the settings of Biome, and the `prettier` key of `package.json` holds
the settings of Prettier.

The tools do not read two parts of the site. The components in `src/components/ui` come from the
Intent UI registry, and the shadcn command line writes over them, so they keep the layout of the
registry. The stylesheet uses the variant rules of Tailwind v4, and Biome cannot parse them.

`pnpm typecheck` runs `astro check`, which checks the Astro pages and the React components.
`pnpm test` runs the unit tests with Vitest. The tests need no API and no build. They replace the
settings that Astro gives the build with the fixed values in `src/test/astro-env-server.ts`.

From the root of the repository, `make site-lint` and `make site-fmt` run `pnpm lint` and
`pnpm fmt`. `make site-check` runs the type check and the tests, and `make site-test` checks
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
when `robots.txt` or the sitemap is missing, when `robots.txt` does not name `sitemap-index.xml`,
and when the sitemap lists an address that Pages does not serve as written. Such an address ends
in `.html` or in a slash, is `404`, or has no page. It stops
when a file names the API, which means that it holds `api.ohfootball.io` or `graphql` in any case.
Only the API page, `api.html`, may name it. So no script or stylesheet under `assets/` and no other
page may. Set `API_DOCS_PAGE` to check another file name. When `GRAPHQL_API_KEY` is set, it stops when the key is shorter than 16
characters, and when a file holds the key. The API page may not hold the key either. It prints only the names of those files. It then writes
`assets/404.html`, a line of plain text.

Pages answers an address that has no page with the nearest `404.html` and the status 404. At the
root, that is the not-found page that `src/pages/404.astro` draws. Under `assets/`, it is the line
of plain text. `public/_headers` sets how long a browser keeps each file.

### Search engines

`public/robots.txt` lets every crawler read every page and names the sitemap. The sitemap
integration in `astro.config.ts` writes `sitemap-index.xml` and `sitemap-0.xml` from the pages that
the build wrote. It leaves out `404`. Each page has a canonical link and an `og:url` on
`https://ohfootball.io`, so the copies on `www.ohfootball.io` and on `ohfootball.pages.dev` point
to it. The not-found page has neither, because it tells search engines to leave it out. The home
page also has a JSON-LD `WebSite` record. The link previews have no image, because the site has no
image yet.

`www.ohfootball.io` serves the same files as `ohfootball.io` and does not redirect. A redirect is
a rule in the Cloudflare dashboard and not part of this directory. Until one exists, the canonical
link keeps the copy on `www.ohfootball.io` out of search results.

To see how Pages answers, serve the directory with Wrangler:

```sh
npx wrangler pages dev dist
```

## Publish the site

`.github/workflows/site.yml` runs the same build against `https://api.ohfootball.io/graphql` and
sends `dist` to Cloudflare Pages. It starts on a push to main that changes the site, and when the
weekly run asks for it. `docs/architecture.md` describes the workflow and its settings.
