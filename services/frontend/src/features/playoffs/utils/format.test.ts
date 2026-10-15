import { describe, expect, it } from "vitest"
import {
  divisionLabel,
  formatAverage,
  formatGameDate,
  formatOdds,
  formatPoints,
  formatRecord,
  opponentLabel,
  regionLabel,
} from "@/features/playoffs/utils/format"

describe("formatOdds", () => {
  it("never shows a chance as certain or impossible", () => {
    expect(formatOdds(1)).toBe(">99%")
    expect(formatOdds(0.996)).toBe(">99%")
    expect(formatOdds(0.5)).toBe("50%")
    expect(formatOdds(0.004)).toBe("<1%")
    expect(formatOdds(0)).toBe("<1%")
    expect(formatOdds(null)).toBe("–")
  })
})

describe("labels", () => {
  it("names divisions, regions, records, points and averages", () => {
    expect(divisionLabel(3)).toBe("Division III")
    expect(divisionLabel(9)).toBe("Division 9")
    expect(regionLabel(12)).toBe("Region 12")
    expect(formatRecord({ wins: 6, losses: 4, ties: 0 })).toBe("6-4")
    expect(formatRecord({ wins: 6, losses: 3, ties: 1 })).toBe("6-3-1")
    expect(formatAverage(12.3456)).toBe("12.35")
    expect(formatPoints(43)).toBe("43")
    expect(formatPoints(147.25000000000003)).toBe("147.25")
    expect(formatGameDate("2026-10-02")).toBe("Oct 2")
  })

  it("names the opponent from the side of the team", () => {
    expect(opponentLabel({ location: "HOME", opponentName: "Mentor" })).toBe("vs Mentor")
    expect(opponentLabel({ location: "AWAY", opponentName: "Lorain" })).toBe("at Lorain")
    expect(opponentLabel({ location: "NEUTRAL", opponentName: "Euclid" })).toBe(
      "vs Euclid (neutral)",
    )
  })
})
