import { describe, expect, it, vi } from "vitest"
import type { MapTeam } from "@/features/map/api/get-map-teams"
import type { CountyMap } from "@/features/map/server/county-map"
import { playoffMapData } from "@/features/playoff-map/server/playoff-map"
import type { PlayoffProjection, PlayoffRegion } from "@/features/playoffs/types"
import type { Game } from "@/types/api"

// With this fit a school at longitude x and latitude 0 is at (x, 50) on the map.
const map: CountyMap = {
  width: 200,
  height: 100,
  outline: "",
  counties: [
    { name: "A", path: "M0,0L100,0L100,100L0,100Z", bounds: [0, 0, 100, 100] },
    { name: "B", path: "M100,0L200,0L200,100L100,100Z", bounds: [100, 0, 200, 100] },
  ],
  regions: { 1: [1, 2] },
  fit: { scale: 360, x: -180, y: -130 },
}

function region(number: number, division: number, ids: string[]): PlayoffRegion {
  return {
    region: number,
    division,
    teams: ids.map((teamId, index) => ({
      teamId,
      sourceId: `s-${teamId}`,
      name: `Team ${teamId}`,
      rating: index === 0 ? null : 10.04 - index,
    })),
  } as PlayoffRegion
}

const regionOne = Array.from({ length: 14 }, (_, index) => `t${index + 1}`)

const teams = regionOne.slice(0, 12).map(
  (id, index): MapTeam => ({
    id,
    sourceId: `m-${id}`,
    name: `Map ${id}`,
    county: "A",
    division: 1,
    region: 1,
    primaryColor: index === 0 ? "#cc0000" : null,
    secondaryColor: null,
    rating: null,
    coordinates: id === "t12" ? null : { latitude: 0, longitude: 5 + 8 * index },
  }),
)

function game(id: string, date: string, opponentId: string, result: Game["result"]): Game {
  return {
    id,
    week: 1,
    date,
    opponentId,
    opponentName: opponentId,
    location: result === "WIN" ? "HOME" : "AWAY",
    result,
    teamScore: null,
    opponentScore: null,
    playoff: true,
    notes: null,
    prediction: null,
  }
}

const schedules = new Map<string, Game[]>([
  [
    "t5",
    [
      game("g1", "2026-10-30", "t12", "WIN"),
      game("g5", "2026-11-06", "t4", "LOSS"),
      game("out", "2026-11-06", "u1", "WIN"),
    ],
  ],
  ["t6", [game("g2", "2026-10-30", "t11", "WIN")]],
  ["t7", [game("g3", "2026-10-30", "t10", "WIN")]],
  ["t8", [game("g4", "2026-10-30", "t9", "WIN")]],
])

const projection = {
  season: 2026,
  asOf: "2026-10-27",
  regions: [
    region(2, 1, ["u1", "u2"]),
    region(1, 1, regionOne),
    region(9, 3, ["w1"]),
    { region: 5, division: 2, teams: null } as unknown as PlayoffRegion,
  ],
} as PlayoffProjection

describe("playoffMapData", () => {
  it("builds each region with its seeds, its land, and its games", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const data = playoffMapData(projection, schedules, teams, map)

    expect(data.season).toBe(2026)
    expect(data.shape).toEqual({
      width: 200,
      height: 100,
      outline: "",
      counties: [
        { name: "A", path: map.counties[0].path },
        { name: "B", path: map.counties[1].path },
      ],
    })
    expect(data.asOf).toBe("2026-10-27")
    expect(data.divisions.map((division) => division.division)).toEqual([1, 3])
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()

    const [one, two] = data.divisions[0].regions
    expect(one.region).toBe(1)
    expect(one.counties).toEqual(["A"])
    expect(one.teams.map((team) => team.id)).toEqual(regionOne.slice(0, 12))
    expect(one.teams[0]).toEqual({
      id: "t1",
      sourceId: "s-t1",
      name: "Team t1",
      seed: 1,
      rating: null,
      color: "#cc0000",
      x: 5,
      y: 50,
    })
    expect(one.teams[1].rating).toBe(9)
    expect(one.teams[11]).toMatchObject({ id: "t12", x: null, y: null })
    // The school of t12 has no place, so it has no land.
    expect(one.cells.map((cell) => cell.id).sort()).toEqual(regionOne.slice(0, 11).sort())
    expect(one.cells.reduce((sum, cell) => sum + cell.land, 0)).toBe(10_000)
    expect(one.games).toEqual([
      { id: "g1", round: 1, date: "2026-10-30", winnerId: "t5", loserId: "t12" },
      { id: "g2", round: 1, date: "2026-10-30", winnerId: "t6", loserId: "t11" },
      { id: "g3", round: 1, date: "2026-10-30", winnerId: "t7", loserId: "t10" },
      { id: "g4", round: 1, date: "2026-10-30", winnerId: "t8", loserId: "t9" },
      { id: "g5", round: 2, date: "2026-11-06", winnerId: "t4", loserId: "t5" },
    ])

    // A team that the map does not know keeps its name from the projection and has no place.
    expect(two.teams[0]).toMatchObject({ id: "u1", color: null, x: null, y: null })
    expect(two.cells).toEqual([])

    // A division that the county map does not know has no land.
    expect(data.divisions[1].regions[0].cells).toEqual([])
    expect(data.divisions[1].regions[0].counties).toEqual([])
  })

  it("takes the names from the map, and builds no games with no playoff game", () => {
    const unnamed = {
      ...projection,
      regions: [{ region: 1, division: 1, teams: [{ teamId: "t1" }] } as PlayoffRegion],
    }

    const data = playoffMapData(unnamed, new Map(), teams, map)

    const [only] = data.divisions[0].regions
    expect(only.teams[0]).toMatchObject({ sourceId: "m-t1", name: "Map t1", rating: null })
    expect(only.games).toEqual([])
  })

  it("keeps an empty name for a team that no source names", () => {
    const unknown = {
      ...projection,
      regions: [{ region: 1, division: 1, teams: [{ teamId: "zz" }] } as PlayoffRegion],
    }

    const [only] = playoffMapData(unknown, new Map(), [], map).divisions[0].regions
    expect(only.teams[0]).toMatchObject({ sourceId: "", name: "" })
  })
})
