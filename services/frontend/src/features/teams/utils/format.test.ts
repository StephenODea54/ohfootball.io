import { describe, expect, it } from "vitest"
import {
  formatMargin,
  formatRank,
  formatRating,
  marginIntent,
  ratingTone,
  winPercent,
} from "@/features/teams/utils/format"

describe("formatRating", () => {
  it("gives a rating its sign and rounds it to a whole point", () => {
    expect(formatRating(12.4)).toBe("+12")
    expect(formatRating(-7.6)).toBe("\u22128")
    expect(formatRating(0.4)).toBe("0")
    expect(formatRating(-0.4)).toBe("0")
    expect(formatRating(-0.5)).toBe("0")
  })

  it("colors a rating by its side of the median team", () => {
    expect(ratingTone(12)).toBe("text-success-subtle-fg")
    expect(ratingTone(-8)).toBe("text-danger-subtle-fg")
    expect(ratingTone(0.2)).toBe("text-fg")
  })
})

describe("formatRank", () => {
  it("writes a rank with a number sign", () => {
    expect(formatRank(18)).toBe("#18")
  })
})

describe("winPercent", () => {
  it("rounds to a whole percent and never shows a sure result", () => {
    expect(winPercent(0.614)).toBe(61)
    expect(winPercent(0.996)).toBe(99)
    expect(winPercent(0.003)).toBe(1)
  })
})

describe("formatMargin", () => {
  it("names the side that the model expects to win and by how much", () => {
    expect(formatMargin(4.2)).toBe("W by 4")
    expect(formatMargin(-13.5)).toBe("L by 14")
    expect(formatMargin(0.3)).toBe("Even")
    expect(formatMargin(-0.49)).toBe("Even")
    expect(formatMargin(-0.5)).toBe("L by 1")
  })

  it("colors a margin as a win, a loss, or an even game", () => {
    expect(marginIntent(4.2)).toBe("success")
    expect(marginIntent(-13.5)).toBe("danger")
    expect(marginIntent(0.3)).toBe("secondary")
    expect(marginIntent(-0.49)).toBe("secondary")
  })
})
