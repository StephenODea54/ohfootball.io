/**
 * The facts that the Data page tells people. Only the Data page imports this file. It names the
 * download and never the API, because `make pages` fails when a page other than the API page
 * names the API.
 *
 * The page holds no date and no row count. The site is built before the weekly run uploads the
 * zip, so a value read at build time would be one week old.
 */

const downloadOrigin = "https://data.ohfootball.io"
const archiveFile = "ohfootball.zip"
export const datePlaceholder = "YYYY-MM-DD"

export const latestZipUrl = `${downloadOrigin}/latest/${archiveFile}`
export const snapshotsUrl = `${downloadOrigin}/snapshots.json`

/** The zip of one run. The date has the form YYYY-MM-DD, as snapshots.json lists it. */
export function snapshotZipUrl(date: string): string {
  return `${downloadOrigin}/${date}/${archiveFile}`
}

export const license = "CC0-1.0"
export const licenseUrl = "https://creativecommons.org/publicdomain/zero/1.0/"

/**
 * The five CSV files, in the order the zip holds them. The README.md of the zip describes each
 * column, with the text of the dataset package. The page does not repeat it, so that text has one
 * source.
 */
export const files = [
  { name: "dim_teams.csv", holds: "Each team in each season, with its place and division." },
  { name: "dim_dates.csv", holds: "The calendar that the games are dated against." },
  { name: "fct_games.csv", holds: "Each game, with both scores and the home side." },
  {
    name: "fct_team_ratings.csv",
    holds: "The rating of each Ohio team through each season, in points.",
  },
  {
    name: "fct_game_predictions.csv",
    holds: "The expected margin and the win probability of each game of an Ohio team.",
  },
] as const

/**
 * Downloads the newest zip and reads one file. pandas cannot read a zip that holds more than one
 * file in one call, so the example opens the file from the zip.
 */
export const pythonExample = `import io
import urllib.request
import zipfile

import pandas as pd

url = "${latestZipUrl}"
with zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(url).read())) as archive:
    games = pd.read_csv(archive.open("fct_games.csv"))`
