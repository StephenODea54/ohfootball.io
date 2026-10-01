import { describe, expect, it } from "vitest"
import { luminance, teamColor } from "@/features/map/utils/team-color"

describe("luminance", () => {
  it("runs from 0 for black to 1 for white", () => {
    expect(luminance("#000000")).toBe(0)
    expect(luminance("#FFFFFF")).toBeCloseTo(1)
    expect(luminance("#ff0000")).toBeCloseTo(0.2126)
  })
})

describe("teamColor", () => {
  it("uses the primary color when it shows on both themes", () => {
    expect(teamColor("#FF0000", "#000000")).toBe("#FF0000")
  })

  it("falls back to the secondary color when the primary is too dark or too pale", () => {
    expect(teamColor("#000000", "#CC0000")).toBe("#CC0000")
    expect(teamColor("#FFFFFF", "#CC0000")).toBe("#CC0000")
  })

  it("gives no color when both are missing, unusable, or not a plain hex color", () => {
    expect(teamColor(null, null)).toBeNull()
    expect(teamColor("#000000", "#FFFFFF")).toBeNull()
    expect(teamColor("red", "#FFF")).toBeNull()
    expect(teamColor('#FF0000" onload="x', null)).toBeNull()
  })
})
