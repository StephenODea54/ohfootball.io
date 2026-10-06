import { describe, expect, it } from "vitest"
import { gameStatus, type PickemGame } from "@/features/pickem/contract"

const team = { teamId: "t", sourceId: "1", name: "T", isHome: false, rank: null }

function game(overrides: Partial<PickemGame> = {}): PickemGame {
  return {
    gameKey: "00000000-0000-0000-0000-000000000001",
    season: 2026,
    date: "2026-10-09",
    week: 8,
    lockAt: "2026-10-10T04:00:00.000Z",
    playoff: false,
    notes: null,
    canceled: false,
    a: team,
    b: team,
    prediction: null,
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
    const result = { winner: "a" as const, aScore: 21, bScore: 14 }
    expect(gameStatus(game({ result }), new Date("2026-10-01"))).toBe("final")
    expect(gameStatus(game({ result, canceled: true }), new Date("2026-10-01"))).toBe("canceled")
  })
})
