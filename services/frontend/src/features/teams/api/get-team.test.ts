import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Team } from "@/types/api"

const graphqlRequest = vi.hoisted(() => vi.fn())

vi.mock("@/lib/graphql-client", () => ({ graphqlRequest }))

const { getTeam } = await import("@/features/teams/api/get-team")

beforeEach(() => {
  graphqlRequest.mockReset()
})

describe("getTeam", () => {
  it("asks for the team with its program history", async () => {
    const team = { id: "massillon", programHistory: [] } as unknown as Team
    graphqlRequest.mockResolvedValue({ team })

    expect(await getTeam("massillon", 2026)).toBe(team)
    const [query, variables] = graphqlRequest.mock.calls[0]
    expect(query).toContain("programHistory {")
    expect(query).toContain("playoffRecord { wins losses ties }")
    expect(query).toContain("rating { value: relativeRating rank }")
    expect(variables).toEqual({ id: "massillon", season: 2026 })
  })

  it("stops the build when the API has no such team", async () => {
    graphqlRequest.mockResolvedValue({ team: null })

    await expect(getTeam("missing", 2026)).rejects.toThrow(
      "the API has no team missing in season 2026",
    )
  })
})
