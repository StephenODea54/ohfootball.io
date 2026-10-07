import { describe, expect, it } from "vitest"
import {
  closesGame,
  finalPickText,
  moveTally,
  pickErrorMessage,
} from "@/features/pickem/utils/pick-text"

describe("closesGame", () => {
  it("closes a game on the codes that say it takes no picks", () => {
    for (const code of ["GAME_LOCKED", "GAME_FINAL", "GAME_CANCELED"]) {
      expect(closesGame(code)).toBe(true)
    }
    expect(closesGame("PICKS_UNAVAILABLE")).toBe(false)
    expect(closesGame("GAME_UNKNOWN")).toBe(false)
  })
})

describe("pickErrorMessage", () => {
  it("gives a short message for each code", () => {
    expect(pickErrorMessage("GAME_LOCKED")).toBe("Picks for this game are closed.")
    expect(pickErrorMessage("GAME_FINAL")).toBe("This game is over, so it takes no picks.")
    expect(pickErrorMessage("GAME_CANCELED")).toBe("This game was canceled, so it takes no picks.")
    expect(pickErrorMessage("GAME_UNKNOWN")).toBe(
      "This game does not take picks yet. Try again in a minute.",
    )
    expect(pickErrorMessage("CLIENT_ADDRESS_UNKNOWN")).toContain("network address is not known")
    expect(pickErrorMessage("PICKS_UNAVAILABLE")).toBe(
      "Your pick did not save. Picks are not available right now.",
    )
  })
})

describe("moveTally", () => {
  it("adds, moves, and removes one pick", () => {
    expect(moveTally({ a: 1, b: 1 }, null, "a")).toEqual({ a: 2, b: 1 })
    expect(moveTally({ a: 2, b: 1 }, "a", "b")).toEqual({ a: 1, b: 2 })
    expect(moveTally({ a: 1, b: 2 }, "b", null)).toEqual({ a: 1, b: 1 })
  })

  it("never counts below zero", () => {
    expect(moveTally({ a: 0, b: 0 }, "a", null)).toEqual({ a: 0, b: 0 })
  })
})

describe("finalPickText", () => {
  it("says whether the pick was correct", () => {
    expect(finalPickText("Massillon", "a", "a")).toBe("You picked Massillon: correct")
    expect(finalPickText("Massillon", "a", "b")).toBe("You picked Massillon: missed")
  })

  it("says when the game had a tie or no winner", () => {
    expect(finalPickText("Massillon", "a", "tie")).toBe(
      "You picked Massillon. The game ended in a tie.",
    )
    expect(finalPickText("Massillon", "b", "none")).toBe(
      "You picked Massillon. The game had no winner.",
    )
  })
})
