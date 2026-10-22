import { describe, expect, it } from "vitest"
import { regionSeeds, seedsAreSet, seedWeight } from "@/features/playoff-map/utils/seeds"
import type { PlayoffProjection } from "@/features/playoffs/types"

describe("seedWeight", () => {
  it("gives seed 12 a weight of 1 and seed 1 a weight of 2.1", () => {
    expect(seedWeight(12)).toBeCloseTo(1, 9)
    expect(seedWeight(11)).toBeCloseTo(1.1, 9)
    expect(seedWeight(1)).toBeCloseTo(2.1, 9)
  })

  it("keeps a seed outside 1 to 12 at the nearest weight", () => {
    expect(seedWeight(14)).toBeCloseTo(1, 9)
    expect(seedWeight(0)).toBeCloseTo(2.1, 9)
  })
})

function projection(asOf: string, dates: string[][]): PlayoffProjection {
  return {
    asOf,
    regions: dates.map((teamDates, index) => ({
      region: index + 1,
      division: 1,
      teams: teamDates.map((date) => ({ remainingGames: date ? [{ date }] : [] })),
    })),
  } as unknown as PlayoffProjection
}

describe("seedsAreSet", () => {
  it("is true when no team has a game left", () => {
    expect(seedsAreSet(projection("2026-10-27", [[""], [""]]))).toBe(true)
  })

  it("is true when each game left has a date before the projection", () => {
    expect(seedsAreSet(projection("2026-10-27", [["2026-10-24"]]))).toBe(true)
  })

  it("is false for a projection made before the last games", () => {
    expect(seedsAreSet(projection("2026-10-20", [[""], ["2026-10-24"]]))).toBe(false)
    expect(seedsAreSet(projection("2026-10-27", [["2026-10-27"]]))).toBe(false)
  })
})

const projected = Array.from({ length: 16 }, (_, index) => `t${index + 1}`)

describe("regionSeeds", () => {
  it("takes the first 12 of the projection when there is no first round", () => {
    expect(regionSeeds(projected, [])).toEqual(projected.slice(0, 12))
  })

  it("takes the seeds from a first round of 4 games", () => {
    const seeds = regionSeeds(projected, [
      { teamIds: ["t12", "t5"], homeId: "t5" },
      { teamIds: ["t6", "t11"], homeId: "t6" },
      { teamIds: ["t7", "t10"], homeId: "t7" },
      { teamIds: ["t8", "t9"], homeId: "t8" },
    ])

    expect(seeds).toEqual(projected.slice(0, 12))
  })

  it("lets the bracket move a team in and out of the field and fix the pairs", () => {
    // t13 plays in place of t12, and t4 hosts a game, so t5 gets a bye.
    const seeds = regionSeeds(projected, [
      { teamIds: ["t4", "t13"], homeId: "t4" },
      { teamIds: ["t6", "t11"], homeId: "t6" },
      { teamIds: ["t7", "t10"], homeId: "t7" },
      { teamIds: ["t8", "t9"], homeId: "t8" },
    ])

    expect(seeds).toEqual([
      "t1",
      "t2",
      "t3",
      "t5",
      "t4",
      "t6",
      "t7",
      "t8",
      "t9",
      "t10",
      "t11",
      "t13",
    ])
  })

  it("puts the better team at home in a game with no home team", () => {
    const seeds = regionSeeds(projected, [
      { teamIds: ["t12", "t5"], homeId: null },
      { teamIds: ["t11", "t6"], homeId: "t9" },
      { teamIds: ["t7", "t10"], homeId: "t7" },
      { teamIds: ["t8", "t9"], homeId: "t8" },
    ])

    expect(seeds).toEqual(projected.slice(0, 12))
  })

  it("keeps the projection when the first round is not 4 games of 8 teams near the top", () => {
    const three = [
      { teamIds: ["t5", "t12"], homeId: "t5" },
      { teamIds: ["t6", "t11"], homeId: "t6" },
      { teamIds: ["t7", "t10"], homeId: "t7" },
    ] satisfies Parameters<typeof regionSeeds>[1]
    const far = [...three, { teamIds: ["t8", "x99"], homeId: "t8" }] satisfies typeof three
    const repeat = [...three, { teamIds: ["t5", "t9"], homeId: "t5" }] satisfies typeof three

    expect(regionSeeds(projected, three)).toEqual(projected.slice(0, 12))
    expect(regionSeeds(projected, far)).toEqual(projected.slice(0, 12))
    expect(regionSeeds(projected, repeat)).toEqual(projected.slice(0, 12))
  })
})
