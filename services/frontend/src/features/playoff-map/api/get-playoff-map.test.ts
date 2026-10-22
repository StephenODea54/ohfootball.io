import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getPlayoffProjection: vi.fn(),
  getCurrentSeason: vi.fn(),
  getMapTeams: vi.fn(),
  getTeam: vi.fn(),
  countyMap: vi.fn(),
  playoffMapData: vi.fn(),
}))

vi.mock("@/features/playoffs/api/get-playoff-projection", () => ({
  getPlayoffProjection: mocks.getPlayoffProjection,
}))
vi.mock("@/features/seasons/api/get-current-season", () => ({
  getCurrentSeason: mocks.getCurrentSeason,
}))
vi.mock("@/features/map/api/get-map-teams", () => ({ getMapTeams: mocks.getMapTeams }))
vi.mock("@/features/teams/api/get-team", () => ({ getTeam: mocks.getTeam }))
vi.mock("@/features/map/server/county-map", () => ({ countyMap: mocks.countyMap }))
vi.mock("@/features/playoff-map/server/playoff-map", async (original) => ({
  ...(await original<typeof import("@/features/playoff-map/server/playoff-map")>()),
  playoffMapData: mocks.playoffMapData,
}))

function projection(gameDate: string, asOf = "2026-10-27") {
  return {
    season: 2026,
    asOf,
    regions: [
      {
        region: 1,
        division: 1,
        teams: [
          { teamId: "a", remainingGames: [] },
          { teamId: "b", remainingGames: [{ date: gameDate }] },
        ],
      },
      { region: 2, division: 1, teams: [{ teamId: "a", remainingGames: [] }] },
    ],
  }
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.getCurrentSeason.mockResolvedValue(2026)
  mocks.getMapTeams.mockResolvedValue(["map teams"])
  mocks.getTeam.mockImplementation(async (id: string) => ({ schedule: [`game of ${id}`] }))
  mocks.countyMap.mockReturnValue("county map")
  mocks.playoffMapData.mockReturnValue("playoff map")
  vi.stubEnv("DEV", false)
  vi.resetModules()
})

async function load() {
  return (await import("@/features/playoff-map/api/get-playoff-map")).getPlayoffMap
}

it("builds the map from the schedules of the teams at the top of each region", async () => {
  const value = projection("2026-10-24")
  mocks.getPlayoffProjection.mockResolvedValue(value)
  const getPlayoffMap = await load()

  expect(await getPlayoffMap()).toBe("playoff map")
  await getPlayoffMap()

  expect(mocks.getTeam).toHaveBeenCalledTimes(2)
  expect(mocks.getTeam).toHaveBeenCalledWith("a", 2026)
  expect(mocks.countyMap).toHaveBeenCalledWith(["map teams"])
  expect(mocks.playoffMapData).toHaveBeenCalledOnce()
  expect(mocks.playoffMapData).toHaveBeenCalledWith(
    value,
    new Map([
      ["a", ["game of a"]],
      ["b", ["game of b"]],
    ]),
    ["map teams"],
    "county map",
  )
})

it("stays closed with a projection from before the last games", async () => {
  mocks.getPlayoffProjection.mockResolvedValue(projection("2026-10-24", "2026-10-20"))
  const getPlayoffMap = await load()

  expect(await getPlayoffMap()).toBeNull()
  expect(mocks.getTeam).not.toHaveBeenCalled()
})

it("stays closed with no projection, or a projection of another season", async () => {
  mocks.getPlayoffProjection.mockResolvedValue(null)
  expect(await (await load())()).toBeNull()

  vi.resetModules()
  mocks.getPlayoffProjection.mockResolvedValue({ ...projection("2026-10-24"), season: 2025 })
  expect(await (await load())()).toBeNull()
})

it("builds the map without the games of a team that does not load", async () => {
  mocks.getPlayoffProjection.mockResolvedValue(projection("2026-10-24"))
  mocks.getTeam.mockImplementation(async (id: string) => {
    if (id === "b") throw new Error("429")
    return { schedule: [`game of ${id}`] }
  })
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const getPlayoffMap = await load()

  expect(await getPlayoffMap()).toBe("playoff map")
  expect(mocks.playoffMapData.mock.calls[0][1]).toEqual(
    new Map([
      ["a", ["game of a"]],
      ["b", []],
    ]),
  )
  expect(warn).toHaveBeenCalledOnce()
  warn.mockRestore()
})

it("closes the map and warns when the map fails", async () => {
  mocks.getPlayoffProjection.mockResolvedValue(projection("2026-10-24"))
  mocks.getMapTeams.mockRejectedValue(new Error("429"))
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const getPlayoffMap = await load()

  expect(await getPlayoffMap()).toBeNull()
  expect(warn).toHaveBeenCalledOnce()
  warn.mockRestore()
})
