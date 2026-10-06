import { describe, expect, it } from "vitest"
import type { PickemGame, PickemGamesFile, PickemTeam } from "@/features/pickem/contract"
import { addTeamPicks, otherSide, teamPicks } from "@/features/pickem/utils/team-picks"

function team(teamId: string): PickemTeam {
  return { teamId, sourceId: teamId, name: teamId, isHome: false, rank: null }
}

function game(gameKey: string, a: string, b: string, overrides: Partial<PickemGame> = {}) {
  return {
    gameKey,
    season: 2026,
    date: "2026-10-09",
    week: 8,
    lockAt: "2026-10-10T04:00:00.000Z",
    playoff: false,
    notes: null,
    canceled: false,
    a: team(a),
    b: team(b),
    prediction: null,
    result: null,
    ...overrides,
  } satisfies PickemGame
}

function file(games: PickemGame[]): PickemGamesFile {
  return {
    season: 2026,
    generatedAt: "2026-10-06T00:00:00.000Z",
    window: { from: "2026-09-26", to: "2026-10-20" },
    games,
  }
}

describe("teamPicks", () => {
  const games = file([
    game("g1", "m", "k"),
    game("g2", "k", "m", { result: { winner: "b", aScore: 7, bScore: 21 } }),
    game("g3", "m", "p", { canceled: true }),
    game("g4", "k", "p"),
  ])

  it("keeps the games of the team with its side and the winner", () => {
    expect([...teamPicks(games, "m").values()]).toEqual([
      { gameKey: "g1", side: "a", lockAt: "2026-10-10T04:00:00.000Z", winner: null },
      { gameKey: "g2", side: "b", lockAt: "2026-10-10T04:00:00.000Z", winner: "b" },
    ])
  })

  it("leaves out a canceled game and the games of other teams", () => {
    expect([...teamPicks(games, "p").keys()]).toEqual(["g4"])
    expect(teamPicks(games, "x").size).toBe(0)
  })
})

describe("addTeamPicks", () => {
  it("gives a pick only to a game in the file", () => {
    const picks = teamPicks(file([game("g1", "m", "k")]), "m")
    const schedule = addTeamPicks([{ id: "g1" }, { id: "g9" }], picks)

    expect(schedule.map((row) => row.pick?.gameKey ?? null)).toEqual(["g1", null])
  })
})

it("names the other side", () => {
  expect(otherSide("a")).toBe("b")
  expect(otherSide("b")).toBe("a")
})
