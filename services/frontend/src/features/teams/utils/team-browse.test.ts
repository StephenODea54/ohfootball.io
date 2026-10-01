import { describe, expect, it } from "vitest"
import { ALL_COUNTIES, ALL_DIVISIONS, ALL_REGIONS } from "@/features/teams/utils/filter-teams"
import { browseView } from "@/features/teams/utils/team-browse"
import type { TeamSummary } from "@/types/api"

function team(
  id: string,
  rank: number | null,
  region = 1,
  county: string | null = null,
): TeamSummary {
  return {
    id,
    season: 2026,
    sourceId: id,
    name: id,
    mascot: null,
    city: null,
    county,
    division: 1,
    region,
    primaryColor: null,
    secondaryColor: null,
    record: { wins: 0, losses: 0, ties: 0 },
    outOfStateGamesPlayed: 0,
    rating:
      rank === null
        ? null
        : { season: 2026, value: 1600 - rank, rank, previousRank: null, asOf: "2026-09-27" },
  }
}

const unfiltered = { region: ALL_REGIONS, division: ALL_DIVISIONS, county: ALL_COUNTIES }

describe("browseView", () => {
  it("shows only rated schools, up to the limit, when no filter is set", () => {
    const teams = [team("a", 1), team("b", 2), team("c", 3), team("d", null)]

    const view = browseView(teams, unfiltered, 2026, 2)

    expect(view.heading).toBe("Top Rated")
    expect(view.gridLabel).toBe("Top Rated Schools")
    expect(view.summary).toBe(
      "The 2 best rated schools in 2026. Pick a region, division, or county to see more.",
    )
    expect(view.tiles.map((tile) => tile.id)).toEqual(["a", "b"])
  })

  it("leaves unrated schools out of the top rated grid when fewer are rated than the limit", () => {
    const view = browseView([team("a", 1), team("b", null)], unfiltered, 2026, 24)

    expect(view.summary).toBe(
      "1 school rated so far in 2026. Pick a region, division, or county to see more.",
    )
    expect(view.tiles.map((tile) => tile.id)).toEqual(["a"])
  })

  it("does not call the schools the best when every rated school fits in the grid", () => {
    const view = browseView([team("a", 1), team("b", 2)], unfiltered, 2026, 2)

    expect(view.summary).toBe(
      "2 schools rated so far in 2026. Pick a region, division, or county to see more.",
    )
  })

  it("uses a plain heading before any school has a rating", () => {
    const view = browseView([team("a", null), team("b", null)], unfiltered, 2026, 1)

    expect(view.heading).toBe("Schools")
    expect(view.gridLabel).toBe("Schools")
    expect(view.summary).toBe(
      "Ratings for 2026 start after the first games. Pick a region, division, or county to see more.",
    )
    expect(view.tiles.map((tile) => tile.id)).toEqual(["a"])
  })

  it("shows every match of a filter and says the ranks are for the whole state", () => {
    const teams = [team("a", 1, 1), team("b", 2, 2), team("c", 3, 2), team("d", null, 2)]

    const view = browseView(teams, { ...unfiltered, region: "2" }, 2026, 1)

    expect(view.heading).toBe("Matching Schools")
    expect(view.gridLabel).toBe("Matching Schools")
    expect(view.summary).toBe("3 schools in 2026. Ranks are for the whole state.")
    expect(view.tiles.map((tile) => tile.id)).toEqual(["b", "c", "d"])
  })

  it("treats a division alone as a filter", () => {
    const view = browseView([team("a", 1)], { ...unfiltered, division: "2" }, 2026, 24)

    expect(view.heading).toBe("Matching Schools")
    expect(view.summary).toBe("0 schools in 2026. Ranks are for the whole state.")
    expect(view.tiles).toEqual([])
  })

  it("treats a county alone as a filter", () => {
    const teams = [team("a", 1, 1, "Stark"), team("b", 2, 1, "Summit"), team("c", 3, 1, null)]

    const view = browseView(teams, { ...unfiltered, county: "Stark" }, 2026, 24)

    expect(view.heading).toBe("Matching Schools")
    expect(view.tiles.map((tile) => tile.id)).toEqual(["a"])
  })

  it("writes one match in the singular", () => {
    const view = browseView([team("a", 1)], { ...unfiltered, region: "1" }, 2026, 24)

    expect(view.summary).toBe("1 school in 2026. Ranks are for the whole state.")
  })
})
