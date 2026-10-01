import { beforeEach, describe, expect, it, vi } from "vitest"

const graphqlRequest = vi.hoisted(() => vi.fn())

vi.mock("@/lib/graphql-client", () => ({ graphqlRequest }))
vi.mock("@/features/seasons/api/get-current-season", () => ({
  getCurrentSeason: async () => 2026,
}))

async function loadGetMapTeams() {
  // The answer is kept in the module, so each test loads a fresh copy.
  vi.resetModules()
  return (await import("@/features/map/api/get-map-teams")).getMapTeams
}

beforeEach(() => {
  graphqlRequest.mockReset()
  vi.stubEnv("DEV", false)
})

describe("getMapTeams", () => {
  it("asks for the location and the rating of every team of the season", async () => {
    graphqlRequest.mockResolvedValue({ teams: [{ id: "a" }] })
    const getMapTeams = await loadGetMapTeams()

    expect(await getMapTeams()).toEqual([{ id: "a" }])
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining("coordinates { latitude longitude }"),
      { season: 2026 },
    )
  })

  it("stops when the API may have cut the list", async () => {
    graphqlRequest.mockResolvedValue({ teams: Array.from({ length: 1000 }, () => ({})) })
    const getMapTeams = await loadGetMapTeams()

    await expect(getMapTeams()).rejects.toThrow()
  })
})
