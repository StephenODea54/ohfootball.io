import { describe, expect, it } from "vitest"
import {
  formatBin,
  formatCount,
  formatDateRange,
  formatPercent,
  formatScore,
  formatSigned,
  formatWeek,
  MISSING,
} from "@/features/accuracy/utils/format"

describe("the formats of the Accuracy page", () => {
  it("formats a share as a percent", () => {
    expect(formatPercent(0.80779)).toBe("80.8%")
    expect(formatPercent(0.5383, 0)).toBe("54%")
    expect(formatPercent(null)).toBe(MISSING)
  })

  it("formats a score with four decimals", () => {
    expect(formatScore(0.130876)).toBe("0.1309")
    expect(formatScore(null)).toBe(MISSING)
  })

  it("formats a count with commas", () => {
    expect(formatCount(97688)).toBe("97,688")
  })

  it("gives a number its sign", () => {
    expect(formatSigned(2.14)).toBe("+2.1")
    expect(formatSigned(-20.65)).toBe("−20.6")
    expect(formatSigned(0.02)).toBe("0.0")
    expect(formatSigned(-0.02)).toBe("0.0")
    expect(formatSigned(3, 0)).toBe("+3")
  })

  it("names a week and a bin", () => {
    expect(formatWeek(4)).toBe("Week 4")
    expect(formatBin(0.5, 0.55)).toBe("50–55%")
    expect(formatBin(0.95, 1)).toBe("95–100%")
  })

  it("formats the days of a week", () => {
    expect(formatDateRange("2026-09-24", "2026-09-26")).toBe("Sep 24 – 26")
    expect(formatDateRange("2026-09-30", "2026-10-03")).toBe("Sep 30 – Oct 3")
    expect(formatDateRange("2026-09-25", "2026-09-25")).toBe("Sep 25")
  })
})
