import { describe, expect, it } from "vitest"
import type { PlayoffOutlook, PlayoffProjection } from "@/features/playoffs/types"
import { divisionsOf, regionData, regionKeys, selectionFrom } from "@/features/playoffs/utils/view"

const team: PlayoffOutlook = {
  teamId: "t1",
  sourceId: "1",
  name: "Medina",
  rating: 12.345,
  record: { wins: 2, losses: 6, ties: 0 },
  levelOne: 13,
  levelTwo: 147.25,
  divisor: 96,
  average: 8.0234,
  qualifyProbability: 0.612345,
  homeProbability: 0.1,
  byeProbability: 0.000049,
  regionWinProbability: 0.0123456,
  expectedSeed: 11.4,
  remainingGames: [
    {
      id: "g1",
      date: "2026-10-23",
      opponentId: "o",
      opponentName: "Solon",
      location: "AWAY",
      winProbability: 0.51234,
      qualifyIfWin: null,
      qualifyIfLoss: 0.0151,
      homeIfWin: 0,
      homeIfLoss: 0,
    },
  ],
  records: [
    {
      record: { wins: 3, losses: 7, ties: 0 },
      probability: 0.4321,
      runs: 43210,
      lowAverage: 3,
      medianAverage: 4,
      highAverage: 5,
      qualifyProbability: 0.2,
      homeProbability: 0,
      byeProbability: 0,
    },
  ],
}

const projection = {
  regions: [
    { region: 6, division: 2, teams: [team] },
    { region: 1, division: 1, teams: [{ ...team, rating: null }] },
    { region: 5, division: 2, teams: [] },
  ],
} as unknown as PlayoffProjection

describe("regionData", () => {
  it("keeps the rows of the table and the details, rounded", () => {
    const data = regionData(projection.regions[0])

    expect(data.rows[0]).toEqual({
      sourceId: "1",
      name: "Medina",
      rating: 12.3,
      record: "2-6",
      qualifyProbability: 0.612,
      byeProbability: 0,
      homeProbability: 0.1,
      regionWinProbability: 0.012,
    })
    expect(data.details[0]).toEqual({
      teamId: "t1",
      sourceId: "1",
      name: "Medina",
      record: "2-6",
      levelOne: 13,
      levelTwo: 147.25,
      divisor: 96,
      average: 8.02,
      homeProbability: 0.1,
      remainingGames: [
        {
          id: "g1",
          date: "2026-10-23",
          opponentName: "Solon",
          location: "AWAY",
          winProbability: 0.512,
          qualifyIfWin: null,
          qualifyIfLoss: 0.015,
        },
      ],
      records: [
        {
          record: { wins: 3, losses: 7, ties: 0 },
          probability: 0.432,
          runs: 43210,
          lowAverage: 3,
          highAverage: 5,
          qualifyProbability: 0.2,
        },
      ],
    })
    expect(regionData(projection.regions[1]).rows[0].rating).toBeNull()
  })
})

describe("selectionFrom", () => {
  const divisions = divisionsOf(regionKeys(projection))

  it("groups the regions by division", () => {
    expect(divisions).toEqual([
      { division: 1, regions: [1] },
      { division: 2, regions: [5, 6] },
    ])
  })

  it("reads the division and the region of a link", () => {
    expect(selectionFrom("?division=2&region=6", divisions)).toEqual({ division: 2, region: 6 })
  })

  it("falls back to the first region of the division and to the first division", () => {
    expect(selectionFrom("?division=2&region=1", divisions)).toEqual({ division: 2, region: 5 })
    expect(selectionFrom("?division=9", divisions)).toEqual({ division: 1, region: 1 })
    expect(selectionFrom("", divisions)).toEqual({ division: 1, region: 1 })
    expect(selectionFrom("", [])).toBeNull()
  })
})
