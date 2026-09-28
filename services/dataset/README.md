# dataset

Publishes the warehouse marts to Kaggle as one public dataset with a version per run. This is the
last step of the weekly pipeline, and it changes nothing the site reads.

## What it publishes

One CSV file per mart, current rows only, keys and dates as text and flags as 0 or 1:

| File                        | Holds                                                         |
| --------------------------- | ------------------------------------------------------------- |
| `dim_teams.csv`             | One row per team per season, with place, division, and colors  |
| `dim_dates.csv`             | The calendar the games are dated against                       |
| `fct_games.csv`             | One row per game, both scores, both results, and the home side |
| `fct_team_elo_ratings.csv`  | The rating each team held at the end of each season            |
| `fct_game_predictions.csv`  | The ratings carried into a game and the win probability        |

`marts.py` names every column. Nothing is taken with a star, so the shape of the published dataset
is read from that one file. The casts match the ones the API snapshot uses, so a reader of the
dataset and a reader of the site see the same values.

`marts.py` also holds the description of each file and of each column. Kaggle shows that text next
to the data. A column cannot be added without a description, because the tests fail for a column
that has none and for a description that names a column the dataset does not publish.

Two of the marts keep a version of every observation. The dataset carries the current version only
and drops `valid_from`, `valid_to`, and `is_current`, because a reader wants the record of a game
rather than the record of the scrapes that found it.

The record covers games played by Ohio teams. An opponent from another state appears in `dim_teams`
with its own `state_code`, and its games are in `fct_games`. The site filters those teams out of
what it shows; the dataset does not, because a game needs both sides to be read at all.

## Commands

    ohfootball-dataset export --directory ./export
    ohfootball-dataset publish --dataset owner/slug

`export` writes the files and sends nothing, which is what a check on a laptop needs. `publish`
writes them to a directory that lasts as long as the upload, then creates the dataset or adds a
version to it. Which of the two it does is decided by asking Kaggle whether the dataset exists, so
the first run and the fiftieth run take the same command.

Locally:

    make dataset-export

## The metadata

`publish` writes `dataset-metadata.json` next to the files. `kaggle_dataset.py` holds its values,
and the descriptions come from `marts.py`:

| Field                     | Value                                                         |
| ------------------------- | ------------------------------------------------------------- |
| `title`                   | 6 to 50 characters                                            |
| `subtitle`                | 20 to 80 characters                                           |
| `description`             | The dataset, a line for each file, and how the files join     |
| `licenses`                | `CC0-1.0`                                                     |
| `keywords`                | `sports`, `united states`                                     |
| `expectedUpdateFrequency` | `weekly`                                                      |
| `userSpecifiedSources`    | joeeitel.com and ohhsfbdb.net, and what ohfootball.io adds    |
| `resources`               | A description for each file and for each of its columns       |

The command refuses a title, a subtitle, or a frequency that Kaggle would refuse, before it sends
anything.

Kaggle reads this file two times in a run. The upload reads the title, the subtitle, the
description, the keywords, and the descriptions of the files and the columns. The upload does not
read the update frequency or the sources. So when Kaggle reports the new version as ready, the
command sends the same file again as an update of the metadata, and that update sets all of the
fields. The command waits up to 10 minutes for the version. If the version is not ready in that
time, the command does not fail. It prints `"metadata": "not ready"`, and the next run sends the
metadata again.

A keyword must be the name of a tag that Kaggle already has. Kaggle drops a name that it does not
know, and the command prints the dropped names under `invalid_tags`. `football` is not used,
because on Kaggle that tag is association football.

The update replaces the metadata on Kaggle. A change made on the Kaggle site to the title, the
subtitle, the description, the tags, the sources, the update frequency, or a description of a file
or a column is therefore lost on the next run. Make those changes in the code. The update also
sends no collaborators, so a collaborator added on the Kaggle site can be removed by it.

### What to do by hand on Kaggle

The command does not set these. Set them one time on the page of the dataset:

1. A cover image of at least 560 by 280 pixels. The update sends no image, so it is not expected
   to change an image set on the site. Look at the image after the next run to be sure.
2. A public notebook that reads the dataset. Kaggle counts one toward the usability rating.

Kaggle calculates the usability rating again some time after a change. It is not updated at once.

## What it reads

| Name                      | Holds                                                     |
| ------------------------- | --------------------------------------------------------- |
| `DATABASE_URL`            | The warehouse, with no password in it                     |
| `PGPASSWORD`              | The warehouse password, read the way libpq reads it        |
| `OHFOOTBALL_MARTS_SCHEMA` | The schema the marts are in, `ohfootball_marts` by default |
| `KAGGLE_USERNAME`         | The Kaggle account that owns the dataset                   |
| `KAGGLE_KEY`              | The API token of that account                              |
| `KAGGLE_DATASET`          | The dataset, as `owner/slug`                               |

The Kaggle client reads `KAGGLE_USERNAME` and `KAGGLE_KEY` from the environment before it looks for
a `kaggle.json`, so the task needs no file and no writable home directory.

## The secret

The pipeline reads all three Kaggle values from one Secrets Manager secret. `OhfootballSecrets`
raises that secret with a key for each of the three and nothing in any of them, and publishes its
ARN as the parameter `/ohfootball/kaggle/secret-arn`. No value of it passes through a stack, because
a template is readable by anyone who can read the stack.

Take the API token from <https://www.kaggle.com/settings> and write the values once:

```sh
aws secretsmanager put-secret-value --secret-id ohfootball/kaggle \
  --secret-string '{"username":"...","key":"...","dataset":"owner/slug"}'
```

A deployment that leaves the shape of the secret alone leaves the values alone with it. Adding a
key to the secret in `infra/lib/secrets-stack.ts` does not, so write the values again after any such
change.

A run against a secret still holding its placeholders does not publish anything. It fails, either
when the container starts or when it reaches Kaggle.

The slug does not have to exist yet. The first run creates the dataset, public, under CC0-1.0.

## Caveats

A failed publication fails the execution. Nothing else is rolled back, because the site and the API
are already published by then, and no alarm is raised. A failed run shows in the state machine
history and nowhere else.

The step retries twice. A retry re-exports and re-uploads from the start. If a first attempt
reached Kaggle and died afterwards, the retry adds a second version of the same data rather than
replacing the first. A refusal of the metadata update is such a case, because it comes after the
upload.
