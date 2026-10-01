import { describe, expect, it } from "vitest"
import {
  hasOutOfStateNote,
  OUT_OF_STATE_LEGEND,
  OUT_OF_STATE_MARK_AT,
  outOfStateNote,
  outOfStateText,
} from "@/features/teams/utils/out-of-state"

const team = (outOfStateGamesPlayed: number) => ({ outOfStateGamesPlayed })

describe("outOfStateNote", () => {
  it("marks a school at the threshold", () => {
    expect(OUT_OF_STATE_MARK_AT).toBe(2)
    expect(outOfStateNote(team(2))).toEqual({
      count: 2,
      label: "2 out-of-state games at half weight",
      text: "2 games against out-of-state teams count at half weight in this rating.",
    })
  })

  it("marks a school above the threshold", () => {
    expect(outOfStateNote(team(4))?.count).toBe(4)
  })

  it("does not mark a school below the threshold", () => {
    expect(outOfStateNote(team(0))).toBeNull()
    expect(outOfStateNote(team(1))).toBeNull()
  })

  it("does not mark a school when the count is missing", () => {
    expect(outOfStateNote({} as { outOfStateGamesPlayed: number })).toBeNull()
    expect(outOfStateNote(team(Number.NaN))).toBeNull()
  })
})

describe("outOfStateText", () => {
  it("uses the singular for one game", () => {
    expect(outOfStateText(1)).toBe(
      "1 game against an out-of-state team counts at half weight in this rating.",
    )
  })

  it("uses the plural for more games", () => {
    expect(outOfStateText(3)).toBe(
      "3 games against out-of-state teams count at half weight in this rating.",
    )
  })
})

describe("hasOutOfStateNote", () => {
  it("is true when one school has a mark", () => {
    expect(hasOutOfStateNote([team(0), team(2)])).toBe(true)
  })

  it("is false when no school has a mark", () => {
    expect(hasOutOfStateNote([team(0), team(1)])).toBe(false)
    expect(hasOutOfStateNote([])).toBe(false)
  })
})

describe("OUT_OF_STATE_LEGEND", () => {
  it("names the threshold", () => {
    expect(OUT_OF_STATE_LEGEND).toContain("2 or more games against out-of-state teams")
  })
})
