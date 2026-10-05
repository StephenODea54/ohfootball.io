# Analytics

The dbt project. It turns the raw layer that the scrapers write into the marts that the rating,
the API and the dataset read.

The weekly run calls `dbt build` inside the pipeline image, as `make transform`. On a workstation,
the `dbt` service of `compose.yaml` runs the same project against the local database.

## Layers

| Layer | Materialized as | Schema | Models |
| --- | --- | --- | --- |
| staging | view | `ohfootball_stg` | `stg_teams`, `stg_games`, `stg_ohhsfbdb_index`, `stg_ohhsfbdb_teams`, `stg_ohhsfbdb_games`, `stg_ohhsfbdb_season_summaries` |
| intermediate | view | `ohfootball_int` | `int_team_observations`, `int_games_canonicalized`, `int_schedule_observations`, `int_ohhsfbdb_sheet_teams`, `int_ohhsfbdb_games`, `int_ohhsfbdb_team_observations`, `int_ohhsfbdb_games_canonicalized` |
| marts | table | `ohfootball_marts` | `dim_teams`, `fct_games`, `dim_dates` |

The staging models clean and type the raw rows. Each one holds one row for each raw row.

The intermediate models choose the rows that a mart reads. `int_team_observations` holds one team
for each successful run, and drops a placeholder row of joeeitel.com when the same run holds the
team in full. `int_games_canonicalized` joins the one or two schedules that hold a game into one
row, and records which of the two teams listed it. `int_schedule_observations` holds each schedule
that a successful run read. The `int_ohhsfbdb_*` models do the same for the backfill from
ohhsfbdb.net.

The marts are Type II. `dim_teams` and `fct_games` write a new version of a row when its content
changes, and each version holds `valid_from`, `valid_to` and `is_current`. `dim_dates` holds each
date between the first and the last game.

The key of a game is made from its season, its date and its two teams. So a game that moves to
another date gets a new key, and the site no longer lists the old one. A version of a game also
ends when a later successful run read the schedule of a team that listed the game, and that
schedule no longer held it. The time of that run is its `valid_to`. Such a game has no current
version, and a moved game is current under its new key. A game that is listed again gets a new
version, so two versions of a game can have a gap between them. An empty page of a team writes no
game row, so it does not count as a read and ends no game. A run that failed ends no game.

`generate_schema_name` gives each layer the schema named in `dbt_project.yml`, with no prefix.
Staging has no schema of its own, so it uses the schema of the profile.

The rating writes `fct_team_ratings` and `fct_game_predictions` to `ohfootball_marts`. dbt
does not build those two tables. The migrations in `infra/postgres/migrations` make them.

## Sources

`_sources.yml` names the raw tables.

| Source | Tables | Written by |
| --- | --- | --- |
| `ohfootball_metadata` | `scrape_runs` | each scraper, one row for each run |
| `ohfootball_raw` | `teams`, `games` | the `joe-eitel` scraper |
| `ohfootball_raw` | `ohhsfbdb_index`, `ohhsfbdb_teams`, `ohhsfbdb_games`, `ohhsfbdb_season_summaries` | the `ohhsfbdb` scraper |

The raw tables only append. The models read only the rows of a run that succeeded. The
`ohhsfbdb_*` models read only the newest such run of the backfill, so a second run of the backfill
does not count a game twice.

## Macros

| File | Holds |
| --- | --- |
| `warehouse_keys.sql` | `ohfootball_uuid`, `team_key` and `game_key`. Each key is a UUID v5 of an ohfootball.io address, so a key does not change from one build to the next. |
| `joeeitel.sql` | `joeeitel_is_placeholder`, the rule for a placeholder row of joeeitel.com. |
| `ohhsfbdb.sql` | The rules that read the cells of ohhsfbdb.net, and `ohhsfbdb_latest_run`. |
| `roman_numeral_to_int.sql` | Reads a division written as a Roman numeral. |
| `generate_schema_name.sql` | The schema of each layer. |

The variable `ohhsfbdb_minted_prefix`, `ohhsfbdb:` by default, starts the identifier that the
backfill makes for a school with no identifier of joeeitel.com.

## Run it

Start the database, and then run dbt through compose:

```sh
make db-up
make dbt-build
```

| Target | Runs |
| --- | --- |
| `make dbt-build` | `dbt build`: every model and every test |
| `make dbt-run` | `dbt run`: every model, no tests |
| `make dbt-test` | `dbt test`: every test |
| `make dbt-parse` | `dbt parse`: reads the project and needs no data |
| `make dbt-debug` | `dbt debug`: checks the connection |
| `make dbt-docs-generate` | `dbt docs generate` |
| `make dbt-docs-serve` | `dbt docs serve` at <http://localhost:8081> |
| `make dbt ARGS="run --select stg_games"` | any dbt command |

`profiles.yml` reads the connection from `DBT_HOST`, `DBT_PORT`, `DBT_USER`, `DBT_PASSWORD`,
`DBT_DATABASE` and `DBT_SCHEMA`. The defaults name the postgres service of `compose.yaml`. The
root `.env.example` lists them.

## Tests

The YAML files of each layer hold the generic tests, such as `unique`, `not_null`,
`accepted_values` and `relationships`. The files in `tests/` are singular tests. Each one is a
query that returns the rows that break a rule, and it passes when it returns no row. They check
that versions do not overlap, that each key has at most one current version, that a current game
is still listed by each team that listed it, that the two results of a game agree, that the two
schools of a game are different, and that a Roman numeral reads as the right number.

The `_*_unit_tests.yml` files hold unit tests. Each one gives a model a few fixed rows and checks
the rows it returns. dbt takes the types of the fixture columns from the models that the database
already holds. So run them with `make dbt-build`, or select a model with its parents, such as
`make dbt ARGS="build --select +fct_games"`. A database that holds older views fails them.

`make dbt-test` runs them all. They need data, so CI does not run them.

## Style

sqlfluff lints and formats the models and the tests. `make lint-sql` checks them, and
`make fmt-sql` fixes them. The root `.sqlfluff` holds the settings. It renders the Jinja without
a warehouse and reads the macros from `macros/`. The files of macros render to nothing, so the
lint skips them.
