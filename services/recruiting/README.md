# Recruiting

This package keeps private snapshots of the recruiting data of CollegeFootballData (CFBD) for the
Ohio players who are still in high school. The rating does not read these snapshots.

## Why the snapshots exist

The recruiting API of CFBD gives only the latest rating of each recruit. That rating is set after
the senior season. A model that reads it for a past season therefore reads the future, and its
backtest looks better than the model is. The only way to know what the ratings were before a game
is to store them before the game. This package stores the answer of the API one time each week.

## What stays private

The terms of CFBD allow private storage, private models and the publication of results such as
ratings and predictions. They do not allow the raw records to be published, as a dataset, a bulk
download, a mirror or a feed.

The snapshots go only in the schema `ohfootball_private`. The API, dbt, the download and the
Kaggle dataset read fixed tables in `ohfootball_marts`, so none of them reads this schema. A test in
`infra/postgres/tests` fails when a file outside this package, the migrations and the docs names
the schema.

## Which classes

On any date in the year Y, the package reads the classes Y + 1, Y + 2 and Y + 3. These are the
seniors, the juniors and the sophomores of the season of Y. On 29 September 2026 it reads the
classes of 2027, 2028 and 2029. `ohfootball_recruiting.classes` holds the rule and the reason.

## The calls

The free key of CFBD allows 1,000 calls a month, and the key stops working when a month goes
over. One class costs one call:

```text
GET https://api.collegefootballdata.com/recruiting/players?year=2027&classification=HighSchool&state=OH
Authorization: Bearer <CFBD_API_KEY>
```

The package never tries a call again, and it does not follow a redirect, because a redirect is a
second call and it would send the key to the new address. A status that is not 200, an answer that
is not a list of records and a fault of the network each stop it with a message that names the
class and the reason. The key goes in a header, so no address holds it, and no message names it.

Each answer has the header `x-calllimit-remaining`, the number of calls left in the month. The
snapshot keeps that number. When fewer calls than the floor are left after a class, the snapshot
stops before the next class and exits with 1, the same as an error. The floor is 100.

## What a snapshot stores

`ohfootball_private.recruiting_snapshots` holds one row for each class on each date: the season,
the address of the call, the number of records and the calls left. `ohfootball_private.recruits`
holds the records in the order of the answer, with the full record as JSON and typed columns for
the CFBD id, the athlete id, the name, the school, the city, the state, the position, the stars, the
rating, the ranking and the commitment. One class is written in one transaction, so a snapshot is
complete or it is not there. A class with no rated recruits gives a snapshot with no records.

A class that is already stored for the date is kept and costs no call. So a second run on the same
day calls only for the classes that are missing. Each class takes an advisory lock for its date and
class first, and the transaction reads at the level READ COMMITTED. So when two runs start at the
same time, the second waits for the first and then keeps its snapshot, and only one calls.

## Running it

```bash
CFBD_API_KEY=... ohfootball-recruiting snapshot --as-of-date 2026-09-29
```

| Setting | Default | What it does |
| --- | --- | --- |
| `CFBD_API_KEY` | none | The key of CFBD. Only the environment gives it. The command has no option for it. |
| `--database-url`, `DATABASE_URL` | the local warehouse | The warehouse |
| `--private-schema`, `OHFOOTBALL_PRIVATE_SCHEMA` | `ohfootball_private` | The schema of the snapshots |
| `--api-url`, `CFBD_API_URL` | `https://api.collegefootballdata.com` | The API |
| `--as-of-date` | today in `OHFOOTBALL_TIME_ZONE` | The date of the snapshot |
| `OHFOOTBALL_TIME_ZONE` | `America/New_York` | The time zone that gives today |
| `--season` | the year of the date | The season, which sets the classes. It must be from 2000 to the year after the date. |
| `--calls-remaining-floor` | 100 | The fewest calls left that let the snapshot go on |

The command prints a summary as JSON. It exits with 0 when every class is stored or kept. The first
error stops it: it prints the summary of what it did, writes the reason on one line, and exits
with 1. A wrong setting stops it with the reason on one line before any call. The weekly run must fail when a source fails, so nothing keeps the run going after an error.

## What it does not do

It does not match recruits to teams, it makes no features, and the rating does not read it.

## Tests

```bash
make -C services/recruiting test
make -C services/recruiting coverage
```

No test calls CFBD or a warehouse. The tests use stand-ins for the opener, for psycopg and for the
store, and some tests use a stand-in server on the loopback address.
