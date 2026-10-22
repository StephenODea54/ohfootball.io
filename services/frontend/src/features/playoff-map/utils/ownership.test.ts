import { describe, expect, it } from "vitest"
import type { PlayoffMapGame, PlayoffMapRegion } from "@/features/playoff-map/types"
import { latestRound, ownersAt, standings } from "@/features/playoff-map/utils/ownership"

const games: PlayoffMapGame[] = [
  { id: "r2", round: 2, date: "2026-11-06", winnerId: "a", loserId: "b" },
  { id: "r1", round: 1, date: "2026-10-30", winnerId: "b", loserId: "c" },
  { id: "r1d", round: 1, date: "2026-10-31", winnerId: "a", loserId: "d" },
  { id: "r3", round: 3, date: "2026-11-13", winnerId: null, loserId: null },
]

describe("ownersAt", () => {
  it("follows the days inside a round, so a late game passes its land on", () => {
    // x beat y on a Wednesday that counts as round 2, and z beat x in round 2 two days later.
    const late: typeof games = [
      { id: "zz", round: 2, date: "2026-11-06", winnerId: "z", loserId: "x" },
      { id: "aa", round: 2, date: "2026-11-04", winnerId: "x", loserId: "y" },
    ]
    expect(Object.fromEntries(ownersAt(["x", "y", "z"], late, 2))).toEqual({
      x: "z",
      y: "z",
      z: "z",
    })
  })

  it("gives each team its own cell at the seeds", () => {
    expect([...ownersAt(["a", "b", "c"], games, 0)]).toEqual([
      ["a", "a"],
      ["b", "b"],
      ["c", "c"],
    ])
  })

  it("passes the land of a loser, with the land it took, to the winner", () => {
    expect(Object.fromEntries(ownersAt(["a", "b", "c", "d"], games, 1))).toEqual({
      a: "a",
      b: "b",
      c: "b",
      d: "a",
    })
    expect(Object.fromEntries(ownersAt(["a", "b", "c", "d"], games, 4))).toEqual({
      a: "a",
      b: "a",
      c: "a",
      d: "a",
    })
  })
})

const region: PlayoffMapRegion = {
  region: 1,
  counties: [],
  teams: ["a", "b", "c", "d"].map((id, index) => ({
    id,
    sourceId: id,
    name: id,
    seed: index + 1,
    rating: null,
    color: null,
    x: 0,
    y: 0,
  })),
  cells: [
    { id: "a", path: "", circle: { x: 0, y: 0, r: 1 }, land: 40 },
    { id: "b", path: "", circle: { x: 0, y: 0, r: 1 }, land: 30 },
    { id: "c", path: "", circle: { x: 0, y: 0, r: 1 }, land: 20 },
    { id: "d", path: "", circle: { x: 0, y: 0, r: 1 }, land: 10 },
  ],
  games,
}

describe("standings", () => {
  it("gives the share of the land and the loss of each team", () => {
    expect(standings(region, 1)).toEqual([
      { teamId: "a", share: 0.5, out: null },
      { teamId: "b", share: 0.5, out: null },
      { teamId: "c", share: 0, out: { round: 1, byId: "b" } },
      { teamId: "d", share: 0, out: { round: 1, byId: "a" } },
    ])
    expect(standings(region, 2)[1]).toEqual({ teamId: "b", share: 0, out: { round: 2, byId: "a" } })
  })

  it("gives no share when the region has no land", () => {
    const empty = { ...region, cells: region.cells.map((cell) => ({ ...cell, land: 0 })) }
    expect(standings(empty, 0)[0].share).toBe(0)
  })
})

describe("latestRound", () => {
  it("is the last round with a result, or 0", () => {
    expect(latestRound([region])).toBe(2)
    expect(latestRound([{ ...region, games: [] }])).toBe(0)
    expect(latestRound([])).toBe(0)
  })
})
