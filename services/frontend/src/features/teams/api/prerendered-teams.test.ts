import { beforeEach, describe, expect, it, vi } from "vitest"
import type { TeamSummary } from "@/types/api"

const env = vi.hoisted(() => ({ PRERENDER_TEAM_LIMIT: undefined as number | undefined }))
const getTeams = vi.hoisted(() => vi.fn())

vi.mock("astro:env/server", () => env)
vi.mock("@/features/teams/api/get-teams", () => ({ getTeams }))

const { prerenderedTeams, takePrerendered } = await import("@/features/teams/api/prerendered-teams")

function teams(...ids: string[]) {
  return ids.map((id) => ({ id }) as TeamSummary)
}

describe("takePrerendered", () => {
  it("keeps every team without a limit", () => {
    expect(takePrerendered(teams("a", "b", "c"), undefined).map((team) => team.id)).toEqual([
      "a",
      "b",
      "c",
    ])
  })

  it("keeps the first teams up to the limit", () => {
    expect(takePrerendered(teams("a", "b", "c"), 2).map((team) => team.id)).toEqual(["a", "b"])
  })

  it("keeps each team one time", () => {
    expect(takePrerendered(teams("a", "a", "b", "c"), 2).map((team) => team.id)).toEqual(["a", "b"])
  })

  it("keeps nothing from an empty list", () => {
    expect(takePrerendered([], 5)).toEqual([])
  })
})

describe("prerenderedTeams", () => {
  beforeEach(() => {
    getTeams.mockResolvedValue(teams("a", "b", "c"))
  })

  it("reads the limit of the build", async () => {
    env.PRERENDER_TEAM_LIMIT = 1
    expect((await prerenderedTeams()).map((team) => team.id)).toEqual(["a"])
  })

  it("keeps every team when the build sets no limit", async () => {
    env.PRERENDER_TEAM_LIMIT = undefined
    expect(await prerenderedTeams()).toHaveLength(3)
  })
})
