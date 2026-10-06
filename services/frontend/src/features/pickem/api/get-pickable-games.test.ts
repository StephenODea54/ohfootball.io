import { afterEach, expect, it, vi } from "vitest"
import type { Team, TeamSummary } from "@/types/api"

const getTeam = vi.hoisted(() => vi.fn())
const teams = vi.hoisted(() => [
  { id: "m", season: 2026, sourceId: "306", name: "Massillon", rating: null },
  { id: "k", season: 2026, sourceId: "1624", name: "McKinley", rating: null },
])

vi.mock("@/features/seasons/api/get-current-season", () => ({
  getCurrentSeason: async () => 2026,
}))
vi.mock("@/features/teams/api/get-teams", () => ({ getTeams: async () => teams }))
vi.mock("@/features/teams/api/prerendered-teams", () => ({ prerenderedTeams: async () => teams }))
vi.mock("@/features/teams/api/get-team", () => ({ getTeam }))

const { getPickableGames, getPickemGames } = await import(
  "@/features/pickem/api/get-pickable-games"
)

afterEach(() => {
  vi.unstubAllEnvs()
})

it("reads each team that gets a page and writes the games between them", async () => {
  getTeam.mockImplementation(
    async (id: string) =>
      ({
        ...(teams.find((entry) => entry.id === id) as TeamSummary),
        schedule: [
          {
            id: "g1",
            week: 1,
            date: "2026-10-09",
            opponentId: id === "m" ? "k" : "m",
            opponentName: "",
            location: id === "m" ? "HOME" : "AWAY",
            result: "UNKNOWN",
            teamScore: null,
            opponentScore: null,
            playoff: false,
            notes: null,
            prediction: null,
          },
        ],
      }) as unknown as Team,
  )

  const file = await getPickableGames(new Date("2026-10-06T18:00:00Z"))

  expect(getTeam.mock.calls).toEqual([
    ["m", 2026],
    ["k", 2026],
  ])
  expect(file.games.map((game) => [game.gameKey, game.a.name, game.b.name])).toEqual([
    ["g1", "McKinley", "Massillon"],
  ])
})

it("makes the games file once for each build", async () => {
  vi.stubEnv("DEV", false)
  getTeam.mockReset()
  getTeam.mockImplementation(
    async (id: string) =>
      ({
        ...(teams.find((entry) => entry.id === id) as TeamSummary),
        schedule: [],
      }) as unknown as Team,
  )

  const [first, second] = await Promise.all([getPickemGames(), getPickemGames()])

  expect(second).toBe(first)
  expect(getTeam).toHaveBeenCalledTimes(teams.length)
})
