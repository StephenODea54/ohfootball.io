import { describe, expect, it } from "vitest"
import {
  gameStatus,
  MAX_BOARD_GAMES,
  otherSide,
  type PickemGame,
  toPickemFile,
} from "@/features/pickem/contract"

function game(overrides: Partial<PickemGame> = {}): PickemGame {
  return {
    gameKey: "00000000-0000-0000-0000-000000000001",
    season: 2026,
    date: "2026-10-09",
    lockAt: "2026-10-10T04:00:00.000Z",
    canceled: false,
    a: { teamId: "a" },
    b: { teamId: "b" },
    result: null,
    ...overrides,
  }
}

describe("gameStatus", () => {
  it("is open until the lock and locked from the lock on", () => {
    expect(gameStatus(game(), new Date("2026-10-10T03:59:59.999Z"))).toBe("open")
    expect(gameStatus(game(), new Date("2026-10-10T04:00:00.000Z"))).toBe("locked")
  })

  it("is final once the game has a result, and canceled before all else", () => {
    const result = { winner: "a" as const }
    expect(gameStatus(game({ result }), new Date("2026-10-01"))).toBe("final")
    expect(gameStatus(game({ result, canceled: true }), new Date("2026-10-01"))).toBe("canceled")
  })
})

describe("toPickemFile", () => {
  it("keeps only what the picks Function reads", () => {
    const file = toPickemFile({
      season: 2026,
      generatedAt: "2026-10-06T00:00:00.000Z",
      window: { from: "2026-09-26", to: "2026-11-27" },
      games: [game(), game({ gameKey: "k2", canceled: true, result: { winner: "b" } })],
    })

    expect(file).toEqual({
      season: 2026,
      generatedAt: "2026-10-06T00:00:00.000Z",
      window: { from: "2026-09-26", to: "2026-11-27" },
      games: [
        {
          gameKey: "00000000-0000-0000-0000-000000000001",
          season: 2026,
          date: "2026-10-09",
          lockAt: "2026-10-10T04:00:00.000Z",
          canceled: false,
          result: null,
        },
        {
          gameKey: "k2",
          season: 2026,
          date: "2026-10-09",
          lockAt: "2026-10-10T04:00:00.000Z",
          canceled: true,
          result: { winner: "b" },
        },
      ],
    })
  })
})

it("names the other side", () => {
  expect(otherSide("a")).toBe("b")
  expect(otherSide("b")).toBe("a")
})

it("keeps a board under the limit of D1 of 100 bound parameters", () => {
  // The picks query binds the hash and each key.
  expect(MAX_BOARD_GAMES + 1).toBeLessThanOrEqual(100)
})
