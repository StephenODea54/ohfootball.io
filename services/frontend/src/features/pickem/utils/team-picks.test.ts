import { describe, expect, it } from "vitest"
import type { PickemGame, PickemGamesFile } from "@/features/pickem/contract"
import { addTeamPicks, type TeamPick, teamPicks } from "@/features/pickem/utils/team-picks"
import type { Game } from "@/types/api"

const LOCK = "2026-10-10T04:00:00.000Z"

function fileGame(gameKey: string, a: string, b: string, overrides: Partial<PickemGame> = {}) {
  return {
    gameKey,
    season: 2026,
    date: "2026-10-09",
    lockAt: LOCK,
    canceled: false,
    a: { teamId: a },
    b: { teamId: b },
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

function game(id: string, opponentId: string, overrides: Partial<Game> = {}): Game {
  return {
    id,
    week: 1,
    date: "2026-10-09",
    opponentId,
    opponentName: opponentId,
    location: "HOME",
    result: "UNKNOWN",
    teamScore: null,
    opponentScore: null,
    playoff: false,
    notes: null,
    prediction: null,
    ...overrides,
  }
}

// As text, 1624 comes before 306, and 306 before 500. So Massillon (306) is side b against
// McKinley (1624) and side a against Perry (500).
const ohio = [
  { id: "m", sourceId: "306" },
  { id: "k", sourceId: "1624" },
  { id: "p", sourceId: "500" },
]

describe("teamPicks", () => {
  it("takes the side and the winner of a game in the games of the build", () => {
    const games = file([
      fileGame("g1", "k", "m"),
      fileGame("g2", "k", "m", { result: { winner: "b" } }),
    ])
    const massillon = { id: "m", sourceId: "306", schedule: [game("g1", "k"), game("g2", "k")] }

    expect([...teamPicks(games, massillon, ohio).values()]).toEqual([
      { gameKey: "g1", side: "b", lockAt: LOCK, winner: null, takesPicks: true },
      { gameKey: "g2", side: "b", lockAt: LOCK, winner: "b", takesPicks: true },
    ])
  })

  it("gives an older game against an Ohio team its side and winner by the same rule", () => {
    const schedule = [
      game("old-win", "k", { date: "2026-08-21", result: "WIN" }),
      game("old-loss", "p", { date: "2026-08-28", result: "LOSS" }),
    ]
    const massillon = { id: "m", sourceId: "306", schedule }

    expect([...teamPicks(file([]), massillon, ohio).values()]).toEqual([
      {
        gameKey: "old-win",
        side: "b",
        lockAt: "2026-08-22T04:00:00.000Z",
        winner: "b",
        takesPicks: false,
      },
      {
        gameKey: "old-loss",
        side: "a",
        lockAt: "2026-08-29T04:00:00.000Z",
        winner: "b",
        takesPicks: false,
      },
    ])
  })

  it("leaves out canceled games and games against teams from other states", () => {
    const games = file([fileGame("g3", "k", "m", { canceled: true })])
    const schedule = [
      game("g3", "k"),
      game("g4", "k", { result: "CANCELED" }),
      game("g5", "michigan"),
    ]

    expect(teamPicks(games, { id: "m", sourceId: "306", schedule }, ohio).size).toBe(0)
  })
})

describe("addTeamPicks", () => {
  it("gives a pick only to a game that has one", () => {
    const pick: TeamPick = {
      gameKey: "g1",
      side: "a",
      lockAt: LOCK,
      winner: null,
      takesPicks: true,
    }
    const schedule = addTeamPicks([{ id: "g1" }, { id: "g9" }], new Map([["g1", pick]]))

    expect(schedule.map((row) => row.pick?.gameKey ?? null)).toEqual(["g1", null])
  })
})
