import { describe, expect, it } from "vitest"
import { pickableGames, pickWindow } from "@/features/pickem/utils/pickable-games"
import type { Game, Team, TeamSummary } from "@/types/api"

// Tuesday 6 October 2026, 14:00 in Ohio.
const NOW = new Date("2026-10-06T18:00:00Z")

function summary(id: string, sourceId: string): TeamSummary {
  return {
    id,
    season: 2026,
    sourceId,
    name: `Team ${id}`,
    mascot: null,
    city: null,
    county: null,
    division: null,
    region: null,
    primaryColor: null,
    secondaryColor: null,
    record: { wins: 0, losses: 0, ties: 0 },
    outOfStateGamesPlayed: 0,
    rating: null,
  }
}

function game(id: string, opponentId: string, overrides: Partial<Game> = {}): Game {
  return {
    id,
    week: 1,
    date: "2026-10-09",
    opponentId,
    opponentName: `Team ${opponentId}`,
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

function team(base: TeamSummary, schedule: Game[]): Team {
  return { ...base, ratingHistory: [], programHistory: [], schedule }
}

const massillon = summary("m", "306")
const mckinley = summary("k", "1624")
const perry = summary("p", "1500")

describe("pickWindow", () => {
  it("runs from ten days ago to the last game date that the build read", () => {
    expect(pickWindow("2026-10-06", "2026-11-28")).toEqual({ from: "2026-09-26", to: "2026-11-28" })
    expect(pickWindow("2026-10-07", "2026-12-05")).toEqual({ from: "2026-09-27", to: "2026-12-05" })
  })

  it("ends where it starts when no game is later", () => {
    expect(pickWindow("2026-12-20", "2026-12-05")).toEqual({ from: "2026-12-10", to: "2026-12-10" })
    expect(pickWindow("2026-10-06", null)).toEqual({ from: "2026-09-26", to: "2026-09-26" })
  })
})

describe("pickableGames", () => {
  it("keeps one game for the two schedules that hold it, with side a the lower number", () => {
    const shared = game("g1", "k", { location: "AWAY" })
    const mirrored = game("g1", "m", { location: "HOME" })
    const file = pickableGames(
      [team(massillon, [shared]), team(mckinley, [mirrored])],
      [massillon, mckinley, perry],
      2026,
      NOW,
    )

    expect(file.season).toBe(2026)
    expect(file.generatedAt).toBe(NOW.toISOString())
    expect(file.window).toEqual({ from: "2026-09-26", to: "2026-10-09" })
    expect(file.games).toEqual([
      {
        gameKey: "g1",
        season: 2026,
        date: "2026-10-09",
        lockAt: "2026-10-10T04:00:00.000Z",
        canceled: false,
        a: { teamId: "k" },
        b: { teamId: "m" },
        result: null,
      },
    ])
  })

  it("turns the result to side a", () => {
    const win = game("g2", "k", {
      date: "2026-10-02",
      result: "WIN",
      teamScore: 28,
      opponentScore: 7,
    })
    const loss = game("g3", "m", {
      date: "2026-10-03",
      result: "LOSS",
      teamScore: 3,
      opponentScore: 10,
    })
    const tie = game("g4", "k", {
      date: "2026-10-03",
      result: "TIE",
      teamScore: 14,
      opponentScore: 14,
    })
    const file = pickableGames(
      [team(massillon, [win, tie]), team(mckinley, [loss])],
      [massillon, mckinley],
      2026,
      NOW,
    )

    expect(file.games.map((entry) => [entry.gameKey, entry.result])).toEqual([
      ["g2", { winner: "b" }],
      ["g3", { winner: "b" }],
      ["g4", { winner: "tie" }],
    ])
  })

  it("gives a double forfeit no winner, whichever schedule comes first", () => {
    const forfeit = { date: "2026-10-02", result: "LOSS" as const, notes: "double forfeit" }
    for (const order of [
      [team(massillon, [game("g7", "k", forfeit)]), team(mckinley, [game("g7", "m", forfeit)])],
      [team(mckinley, [game("g7", "m", forfeit)]), team(massillon, [game("g7", "k", forfeit)])],
    ]) {
      const [only] = pickableGames(order, [massillon, mckinley], 2026, NOW).games
      expect(only.result).toEqual({ winner: "none" })
    }
  })

  it("marks a canceled game", () => {
    const canceled = game("g5", "k", { result: "CANCELED", notes: "canceled" })
    const neutral = game("g6", "k", { date: "2026-10-10", location: "NEUTRAL", playoff: true })
    const file = pickableGames(
      [team(perry, [canceled, neutral]), team(mckinley, [])],
      [perry, mckinley],
      2026,
      NOW,
    )
    expect(file.games.map((entry) => [entry.gameKey, entry.canceled, entry.result])).toEqual([
      ["g5", true, null],
      ["g6", false, null],
    ])
  })

  it("keeps every later game, and leaves out games against other states, against teams not read, and before the window", () => {
    const schedule = [
      game("out-of-state", "ny"),
      game("not-read", "p"),
      game("too-old", "k", { date: "2026-09-25", result: "WIN" }),
      game("late-season", "k", { date: "2026-11-27" }),
      game("first-day", "k", { date: "2026-09-26", result: "WIN" }),
      game("next-week", "k", { date: "2026-10-13" }),
    ]
    const file = pickableGames(
      [team(massillon, schedule), team(mckinley, [])],
      [massillon, mckinley, perry],
      2026,
      NOW,
    )
    expect(file.games.map((entry) => entry.gameKey)).toEqual([
      "first-day",
      "next-week",
      "late-season",
    ])
    expect(file.window).toEqual({ from: "2026-09-26", to: "2026-11-27" })
  })

  it("writes an empty file for a season with no game", () => {
    expect(pickableGames([], [massillon], 2026, NOW)).toEqual({
      season: 2026,
      generatedAt: NOW.toISOString(),
      window: { from: "2026-09-26", to: "2026-09-26" },
      games: [],
    })
  })
})
