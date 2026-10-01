import { describe, expect, it } from "vitest"
import {
  countySummary,
  formatMargin,
  formatRank,
  formatRating,
  formatRatingTick,
  marginIntent,
  ratingTone,
  winPercent,
} from "@/features/teams/utils/format"

describe("formatRating", () => {
  it("gives a rating its sign and one decimal", () => {
    expect(formatRating(12.44)).toBe("+12.4")
    expect(formatRating(57.37)).toBe("+57.4")
    expect(formatRating(-7.66)).toBe("\u22127.7")
    expect(formatRating(3)).toBe("+3.0")
    expect(formatRating(0.04)).toBe("0.0")
    expect(formatRating(-0.04)).toBe("0.0")
  })

  it("rounds a chart label to a whole point", () => {
    expect(formatRatingTick(12.4)).toBe("+12")
    expect(formatRatingTick(-7.6)).toBe("\u22128")
    expect(formatRatingTick(0.4)).toBe("0")
    expect(formatRatingTick(-0.4)).toBe("0")
    expect(formatRatingTick(-0.5)).toBe("0")
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

describe("countySummary", () => {
  it("counts the rated schools of a county and says the ranks are for the state", () => {
    expect(countySummary(12, "Stark")).toBe(
      "12 rated schools in Stark County. Ranks are for the whole state.",
    )
    expect(countySummary(1, "Van Wert")).toBe(
      "1 rated school in Van Wert County. Ranks are for the whole state.",
    )
  })
})
