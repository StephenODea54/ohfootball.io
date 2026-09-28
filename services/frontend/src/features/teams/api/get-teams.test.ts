import { beforeEach, describe, expect, it, vi } from "vitest"
import type { TeamSummary } from "@/types/api"

const graphqlRequest = vi.hoisted(() => vi.fn())

vi.mock("@/lib/graphql-client", () => ({ graphqlRequest }))
vi.mock("@/features/seasons/api/get-current-season", () => ({
  getCurrentSeason: async () => 2026,
}))

function teams(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `team-${index}` }) as TeamSummary)
}

async function loadGetTeams() {
  // The answer is kept in the module, so each test loads a fresh copy.
  vi.resetModules()
  return (await import("@/features/teams/api/get-teams")).getTeams
}

beforeEach(() => {
  graphqlRequest.mockReset()
  vi.stubEnv("DEV", false)
})

describe("getTeams", () => {
  it("asks for the teams of the current season", async () => {
    graphqlRequest.mockResolvedValue({ teams: teams(3) })
    const getTeams = await loadGetTeams()

    expect(await getTeams()).toHaveLength(3)
    expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining("limit: 1000"), {
      season: 2026,
    })
  })

  it("asks the API one time in a build", async () => {
    graphqlRequest.mockResolvedValue({ teams: teams(3) })
    const getTeams = await loadGetTeams()

    await getTeams()
    await getTeams()

    expect(graphqlRequest).toHaveBeenCalledTimes(1)
  })

  it("stops the build when the season fills the cap", async () => {
    graphqlRequest.mockResolvedValue({ teams: teams(1000) })
    const getTeams = await loadGetTeams()

    await expect(getTeams()).rejects.toThrow("fills the cap of 1000")
  })
})
