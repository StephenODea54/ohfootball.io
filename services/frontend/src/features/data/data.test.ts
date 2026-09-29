import { describe, expect, it } from "vitest"
import * as data from "@/features/data/data"
import {
  files,
  latestZipUrl,
  pythonExample,
  snapshotsUrl,
  snapshotZipUrl,
} from "@/features/data/data"

describe("the Data page", () => {
  it("names the addresses of the bucket", () => {
    expect(latestZipUrl).toBe("https://data.ohfootball.io/latest/ohfootball.zip")
    expect(snapshotsUrl).toBe("https://data.ohfootball.io/snapshots.json")
    expect(snapshotZipUrl("2026-09-29")).toBe(
      "https://data.ohfootball.io/2026-09-29/ohfootball.zip",
    )
  })

  it("lists the five files in the order the zip holds them", () => {
    expect(files.map((file) => file.name)).toEqual([
      "dim_teams.csv",
      "dim_dates.csv",
      "fct_games.csv",
      "fct_team_elo_ratings.csv",
      "fct_game_predictions.csv",
    ])
    for (const file of files) {
      expect(file.holds).toMatch(/^[A-Z].*\.$/)
    }
  })

  it("downloads the newest zip and reads a file that the zip holds", () => {
    expect(pythonExample).toContain(`url = "${latestZipUrl}"`)
    const read = [...pythonExample.matchAll(/"([a-z_]+\.csv)"/g)].map((match) => match[1])
    expect(read).toEqual(["fct_games.csv"])
    expect(files.map((file) => file.name)).toContain(read[0])
  })

  it("names the download and never the API", () => {
    // make pages fails when a page other than the API page names the API.
    expect(JSON.stringify(Object.values(data))).not.toMatch(/api\.ohfootball\.io|graphql/i)
  })
})
