# dataset

Publishes the warehouse marts to Kaggle as one public dataset with a version per run, and as a zip
that anyone can download from `data.ohfootball.io`. These are the last two steps of the weekly
pipeline, and they change nothing the site reads.

## What it publishes

One CSV file per mart, current rows only, keys and dates as text and flags as 0 or 1:

| File                        | Holds                                                         |
| --------------------------- | ------------------------------------------------------------- |
| `dim_teams.csv`             | One row per team per season, with place, division, and colors  |
| `dim_dates.csv`             | The calendar the games are dated against                       |
| `fct_games.csv`             | One row per game, both scores, both results, and the home side |
| `fct_team_ratings.csv`      | The rating of each team, weekly this season and at each season end |
| `fct_game_predictions.csv`  | The ratings carried into a game, the margin and the probability |

`marts.py` names every column. Nothing is taken with a star, so the shape of the published dataset
is read from that one file. The casts match the ones the API snapshot uses, so a reader of the
dataset and a reader of the site see the same values.

`marts.py` also holds the description of each file, and the description and the Kaggle type of each
column. Kaggle shows that text next to the data. A column cannot be added without a description and
a type, because the tests fail for a column that has none and for a description that names a column
the dataset does not publish.

Two of the marts keep a version of every observation. The dataset carries the current version only
and drops `valid_from`, `valid_to`, and `is_current`, because a reader wants the record of a game
rather than the record of the scrapes that found it.

The record covers games played by Ohio teams. An opponent from another state appears in `dim_teams`
with its own `state_code`, and its games are in `fct_games`. The site filters those teams out of
what it shows; the dataset does not, because a game needs both sides to be read at all.

## Commands

    ohfootball-dataset export --directory ./export [--archive]
    ohfootball-dataset publish --dataset owner/slug
    ohfootball-dataset publish-download [--bucket name]

`export` writes the files and sends nothing, which is what a check on a laptop needs. With
`--archive` it also writes the zip, its `README.md`, and its `manifest.json` next to the files.
`publish` writes them to a directory that lasts as long as the upload, then creates the dataset or
adds a version to it. Which of the two it does is decided by asking Kaggle whether the dataset
exists, so the first run and the fiftieth run take the same command. `publish-download` writes the
files the same way, zips them, and sends the zip to R2. See [The download](#the-download).

Locally:

    make dataset-export
    make dataset-export ARGS=--archive

## The download

The page `/data` on the site tells people how to download the zip.

`publish-download` sends these objects to the R2 bucket, in this order:

| Object                       | Holds                                     |
| ---------------------------- | ----------------------------------------- |
| `YYYY-MM-DD/ohfootball.zip`  | The zip of the run of that date           |
| `YYYY-MM-DD/manifest.json`   | The manifest of that zip                  |
| `latest/ohfootball.zip`      | The same zip as the newest date           |
| `latest/manifest.json`       | The same manifest as the newest date      |
| `snapshots.json`             | The list of the dates, and the newest one |

The bucket serves them on `https://data.ohfootball.io`, for example
`https://data.ohfootball.io/latest/ohfootball.zip`. A browser saves a zip as
`ohfootball-YYYY-MM-DD.zip`, also when it comes from `latest/`.

The zip holds five CSV files and two text files:

- `README.md`: the license, the sources, and a table of the columns of each file, with the type and
  the description of each column. The text comes from `marts.py`, the same as the text on Kaggle.
- `manifest.json`: the date, and the rows, the size, the SHA-256, and the columns of each file.

The manifest next to the zip holds the same values, and also the key, the size, and the SHA-256 of
the zip. The zip cannot hold its own SHA-256.

The date is the day of the run in `OHFOOTBALL_TIME_ZONE`, the same as the note of a Kaggle version.
The zip is written the same way each time: the entries are in a fixed order, and each entry has the
time 1980-01-01 00:00 and the same mode. The same files on the same date give the same bytes, with
the same image. A different build of zlib can compress them to other bytes.

The dated copy is sent first. So `latest/` never names a date that the bucket does not hold.
`snapshots.json` is sent last. A public bucket does not list its objects, so this file is how a
reader finds the dates. Each run writes it again from the list of the bucket, so a run that stopped
before it is repaired by the next run.

Each object has a SHA-256 in its metadata. Before it sends an object, the command reads the headers
that the bucket holds for the key. When the SHA-256 and the headers are the same, it does not send
the object again. So a second run on the same day with the same marts sends nothing. A second run
with other marts replaces the dated copy of that day.

Each object has the `Cache-Control` value `public, max-age=300, must-revalidate`. Cloudflare
caches a zip for two hours when the object has none. With the rule, a zip can be five minutes old
at the edge after a run. Cloudflare does not cache JSON unless a Cache Rule tells it to, so the
manifests and `snapshots.json` come from the bucket each time, and the rule reaches only the
browser. The dated zip has the same short rule, because a second run on the same day can replace
it, and a longer rule would let the edge serve the old zip beside the new manifest.

boto3 1.36 and later adds a CRC32 checksum to each upload. R2 does not take that checksum on an
upload of one part, so the client sends a checksum only when the API requires one. Each upload
sends `Content-MD5` in its place, and R2 refuses a body that does not match it.

The command stops before it sends anything when a mart holds no rows. This is stricter than
`publish`, because a Kaggle version adds to what Kaggle holds, but `latest/` replaces the zip of
the week before.

The command prints the date, the rows, the size and the SHA-256 of the zip, what it did with each
object (`uploaded` or `unchanged`), the number of dates, and the two addresses of the zip. It
prints no part of the token.

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
| `resources`               | A description of each file and of each column, with its type  |

The command refuses a title, a subtitle, or a frequency that Kaggle would refuse, before it sends
anything.

A column has one of four types: `string`, `numeric`, `boolean`, or `datetime`. The Kaggle client
sends these four unchanged. A key and a date are `string`, because they are written as text. A flag
is `boolean`, because it holds only 0 and 1. The command refuses a column with no type or with
another type.

Kaggle reads this file two times in a run. The upload reads the title, the subtitle, the
description, the keywords, and the descriptions of the files and the columns. The upload does not
read the update frequency or the sources. So when Kaggle reports the new version as ready, the
command sends the same file again as an update of the metadata, and that update sets all of the
fields. The command waits up to 10 minutes for the version. If the version is not ready in that
time, the command does not fail. It prints `"metadata": "not ready"`, and the next run sends the
metadata again.

After the update, the command reads the metadata back from Kaggle. It prints `descriptions` as
`stored`, `missing`, or `not read`. `missing_descriptions` names each file, and each column as
`file:column`, that Kaggle holds no description for. A file that Kaggle does not list counts as
missing, and so does each of its columns. When the read fails, `read_error` holds the reason. A
missing or unread description does not fail the run, because a failure after the upload makes a
second version on the next run. Read the list in the log of the run.

A keyword must be the name of a tag that Kaggle already has. The upload drops a name that it does
not know, and the command prints the dropped names under `invalid_tags`. The metadata update
refuses the whole update for such a name. `football` is not used,
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
| `DATABASE_URL`            | The connection URL of the warehouse                        |
| `OHFOOTBALL_MARTS_SCHEMA` | The schema the marts are in, `ohfootball_marts` by default |
| `KAGGLE_USERNAME`         | The Kaggle account that owns the dataset                   |
| `KAGGLE_KEY`              | The legacy API key of that account, from `kaggle.json`     |
| `KAGGLE_API_TOKEN`        | A token of the new form (`KGAT_...`), in place of the key  |
| `KAGGLE_DATASET`          | The dataset, as `owner/slug`                               |
| `R2_ACCOUNT_ID`           | The ID of the Cloudflare account that holds the bucket     |
| `R2_ACCESS_KEY_ID`        | The Access Key ID of the R2 API token                      |
| `R2_SECRET_ACCESS_KEY`    | The Secret Access Key of the R2 API token                  |
| `R2_BUCKET`               | The name of the bucket, `ohfootball-data`                  |

The Kaggle client reads these values from the environment before it looks for a `kaggle.json`, so
the container needs no file and no writable home directory. It tries `KAGGLE_API_TOKEN` first and
then `KAGGLE_USERNAME` with `KAGGLE_KEY`.

## The credentials

On the host, the values are settings of the `pipeline` application in Dokploy. Nothing else holds
them. Take the key from <https://www.kaggle.com/settings>, under API. The settings of the pipeline
in `docs/architecture.md` list the other values the application needs.

A change to a setting in Dokploy reaches the container only after the application is deployed
again.

The slug does not have to exist yet. The first run creates the dataset, public, under CC0-1.0.

The R2 token is made in the Cloudflare dashboard, under R2, Manage API tokens. Give it the
permission Object Read & Write, and select only the one bucket. The command reads the headers and
the list of the bucket before it writes, so it needs the read permission too. The bucket has to
exist before the first run, and its custom domain `data.ohfootball.io` has to be set. The first
deploy in `docs/architecture.md` tells how.

## Caveats

A failed upload fails `make publish-download`, and the weekly run stops before `publish-dataset`.
The objects sent before the failure stay. The objects after it keep what the run before sent. To
finish the run, run `make publish-download publish-dataset`. A failure between
`latest/ohfootball.zip` and `latest/manifest.json` leaves a manifest that names the zip of the week
before. The next run repairs it.

The zip is sent in one request, and R2 takes at most 5 MiB less than 5 GiB in one request. The command refuses a
larger zip before it sends anything. The manifest gives the size of the zip in each run.

boto3 and botocore add about 30 MB to the dataset image and to the pipeline image.

R2 charges nothing for a download. It counts each read as an operation of class B, and the free
tier holds 10 million of them each month.

A failed publication fails `make publish-dataset`, the last target of the weekly run. Nothing
else is undone, because the site was asked for before it, and no alarm is raised. The failure shows
in the log of the run in the schedules of the `pipeline` application in Dokploy.

Nothing retries the target. A second run exports and uploads from the start. If a first run
reached Kaggle and failed after it, the second run adds a second version of the same data and does
not replace the first. A refusal of the metadata update is such a case, because it comes after the
upload.
