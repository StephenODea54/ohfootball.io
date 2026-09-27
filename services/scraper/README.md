# joe-eitel scraper

Reads high school football results from joeeitel.com and writes them to the raw layer of
the warehouse.

## What one run does

1. Reads the season index at `/hsfoot/` and collects every season the site lists.
2. Chooses which seasons to read. See the season selection rule below.
3. For each chosen season, reads the season page and collects the region pages.
4. Reads every region page and collects the teams of the Ohio High School Athletic
   Association.
5. Reads the page of every one of those teams, and writes the team and its schedule.
6. Reads the page of every opponent that is not one of those teams, and writes the team
   only. The crawler does not follow the schedule of such an opponent. If it did, it would
   leave Ohio and never stop.

The site answers some team pages with status 200 and a body that holds only white space.
See the empty team pages below.

The crawler writes each team page as it reads it. One team page is one transaction.
Nothing is held in memory except the list of teams still to read.

The rows are appended, never updated. Each row carries the identifier of the run that
wrote it, so a later layer chooses which run to read.

## Configuration

Every input comes from the environment. There are no command line flags. The program
checks all of these before it opens a network connection or a database connection.

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | | The Postgres connection string. |
| `SCRAPER_SEASON` | see below | | One season to read, for example `2015`. |
| `SCRAPER_ALL_SEASONS` | see below | | Set to `true` to read every season the site lists. |
| `SCRAPER_BASE_URL` | no | `https://joeeitel.com` | The site to read. |
| `SCRAPER_USER_AGENT` | no | `ohfootball.io scraper/1.0 (+https://ohfootball.io)` | The user agent of each request. |
| `SCRAPER_WORKERS` | no | `6` | The largest number of pages read at the same time. |
| `SCRAPER_RATE` | no | `3` | The largest number of requests each second, across all workers. |
| `SCRAPER_TIMEOUT` | no | `20s` | The time limit of one request. |
| `SCRAPER_RETRIES` | no | `3` | The number of retries after a temporary failure. |

### The season selection rule

Set `SCRAPER_SEASON` or `SCRAPER_ALL_SEASONS`, but not both. If you set neither, or if you
set both, the program stops with a configuration error. This makes the operator say which
seasons to read.

If `SCRAPER_SEASON` names a season that the site does not list yet, the program writes a
summary with the status `skipped`, creates no run row, and exits with code 0. The daily job
supplies the year of the current season, and the site publishes that year before the season
starts.

`SCRAPER_ALL_SEASONS` reads about 27 seasons of about 700 teams each, at three requests
each second. That is more than two hours. Use it for the first load, not for a schedule.

### Examples

Read one season:

```sh
DATABASE_URL=postgres://user:password@localhost:5432/ohfootball \
SCRAPER_SEASON=2015 \
  go run ./cmd/joe-eitel
```

Read every season:

```sh
DATABASE_URL=postgres://user:password@localhost:5432/ohfootball \
SCRAPER_ALL_SEASONS=true \
  go run ./cmd/joe-eitel
```

## Output

The program writes one JSON line for each season, on standard output:

```json
{"run_id":"...","season":2015,"regions":26,"ohsaa_teams":716,"opponent_teams_discovered":61,"opponent_teams_scraped":61,"game_rows":7284,"empty_team_pages":0,"status":"succeeded"}
```

`empty_team_pages` counts the team pages that held only white space. Those teams are also
counted in `ohsaa_teams` or `opponent_teams_scraped`.

The status is `succeeded`, `failed`, or `skipped`. Only `succeeded` and `failed` reach the
database. A skipped run creates no row.

## Failures

Any error stops that season. There is no partial success. The crawler cannot read one team
again on its own, so an incomplete season and a failed season need the same repair, which
is one more run of that season.

An empty team page is the one exception. See the next section.

A season that stops keeps the rows it already wrote, under a run with the status `failed`.
The analytics layer reads only runs with the status `succeeded`, so those rows are not
used. A stopped run therefore leaves rows behind, and they stay until someone removes them.

In the all-seasons mode, a failed season does not stop the seasons that follow. Each season
is its own run. An interrupt does stop the loop, and the run that was open records its
outcome before the program exits.

### Empty team pages

Some team pages hold only white space. The page of Berea in 2001 is an example. The same
team has a normal page in 2002, so the site has no data for that team in that season. Such
a page is not a new format.

The fetch client retries an empty body as it retries a server error. If the body is still
empty after the last retry, the crawler skips the page. It writes a warning that names the
team and the address, and adds one to `empty_team_pages`. The season can still succeed.

A skipped team has no schedule rows. If a schedule of the run names the team, the crawler
writes a placeholder row that holds only the identifier and the name of the link. Without
that row, a game row names a team that the run does not hold, and the relationship tests of
the marts fail. Every opponent came from a schedule, so an empty opponent page always gets a
placeholder. An OHSAA team that no schedule names gets no row.

The placeholder of an OHSAA team also holds the state `OH`, because the team came from a
region list of the OHSAA. The rating and the API read only teams of Ohio. When the link on
the region list has no text, the name comes from the schedule link that named the team.

The analytics layer drops a placeholder when a successful run holds the same team in full.
The full version then stays current while the page is empty. A team that only has
placeholders keeps them.

More than five empty team pages in one season stop the season. The count includes the
opponents. A season lists about 700 OHSAA teams, and a site that is broken answers most of
them empty, so a small limit catches it early.

## Page formats

The site has used two page formats for a team.

| Format | Seasons | How it is recognised |
| --- | --- | --- |
| modern | 2013 and later | A table with the class `schedule`. |
| legacy | 2000 to 2012 | A header cell with a `bgcolor` attribute or a `font` element. |

Each format has its own file in `internal/joeeitel/teampage`. A page that matches no format
stops the run. This is deliberate: a page in a new format means the site changed, and a
person must look at it. An empty page is not a format, and it does not stop the run.

To support a new format, add a file with a type that satisfies `TeamPageParser`, and add
that type to the registry in `parser.go`.

## Tests

The tests read saved pages and make no network request:

```sh
make test
```

One test does read the live site. It reads every team page of one season and reports which
format matched each page. Run it after a change to a matcher, and before a first run of a
season you have not read before:

```sh
SCRAPER_LIVE_SEASON=2002 go test ./internal/joeeitel/teampage/ -run Live -v -timeout 30m
```

One season takes more than five minutes at three requests each second.

The store tests need a database. They skip when `DATABASE_URL` is not set. They delete the
rows they write.
