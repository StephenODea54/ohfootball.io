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
package reads that number from each answer.

## Tests

```bash
make -C services/recruiting test
make -C services/recruiting coverage
```

No test calls CFBD. The tests use a stand-in for the opener, and one test uses a stand-in server on
the loopback address.
