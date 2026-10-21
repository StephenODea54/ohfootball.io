import { describe, expect, it } from "vitest"
import type { SchoolColors } from "@/features/compare/types"
import { lineColors, themeColor } from "@/features/compare/utils/line-colors"
import { chroma, hexToOklab } from "@/lib/oklab"

const PRIMARY = "var(--color-primary-subtle-fg)"
const WARNING = "var(--color-warning-subtle-fg)"
const DEFAULT_A = { light: PRIMARY, dark: PRIMARY }
const DEFAULT_B = { light: WARNING, dark: WARNING }

const RED = { light: "#fb0000", dark: "#ff0000" }
const INK = { light: "#2e2e2e", dark: "#d7d7d7" }

function colors(primary: string | null, secondary: string | null): SchoolColors {
  return { primary, secondary }
}

/** The hue of a color in degrees. */
function hue(hex: string) {
  const { a, b } = hexToOklab(hex)
  return (Math.atan2(b, a) * 180) / Math.PI
}

describe("themeColor", () => {
  it("makes a gray color a dark gray on light and a light gray on dark", () => {
    for (const hex of ["#000000", "#ffffff", "#e0e0e0", "#808080"]) {
      expect(themeColor(hex, "light"), hex).toBe(INK.light)
      expect(themeColor(hex, "dark"), hex).toBe(INK.dark)
    }
    expect(hexToOklab(INK.light).l).toBeCloseTo(0.3, 2)
    expect(hexToOklab(INK.dark).l).toBeCloseTo(0.88, 2)
  })

  it("keeps a color that is already in the band of the theme", () => {
    expect(themeColor("#ff0000", "dark")).toBe("#ff0000")
    expect(themeColor("#0000ff", "light")).toBe("#0000ff")
  })

  it("moves a color into the band of the theme and keeps its hue", () => {
    const navy = themeColor("#000080", "light")
    expect(hexToOklab(navy).l).toBeCloseTo(0.4, 2)
    expect(hue(navy)).toBeCloseTo(hue("#000080"), 0)

    const gold = themeColor("#ffd700", "dark")
    expect(hexToOklab(gold).l).toBeCloseTo(0.82, 2)
    expect(hue(gold)).toBeCloseTo(hue("#ffd700"), 0)

    const paleGold = themeColor("#ffd700", "light")
    expect(hexToOklab(paleGold).l).toBeCloseTo(0.62, 2)
    expect(chroma(hexToOklab(paleGold))).toBeGreaterThan(0.04)
  })

  it("lowers the chroma of a color that sRGB cannot show at the new lightness", () => {
    // Pure red is a little too light for the light theme, and sRGB has no darker red as vivid.
    const red = hexToOklab(RED.light)
    expect(red.l).toBeCloseTo(0.62, 2)
    expect(chroma(red)).toBeLessThan(chroma(hexToOklab("#ff0000")))
    expect(hue(RED.light)).toBeCloseTo(hue("#ff0000"), 0)

    const maroon = themeColor("#810541", "dark")
    expect(hexToOklab(maroon).l).toBeCloseTo(0.62, 2)
    expect(hue(maroon)).toBeCloseTo(hue("#810541"), 0)
  })
})

describe("lineColors", () => {
  it("gives Piqua red and Troy ink, because the red of Troy is too close", () => {
    expect(lineColors(colors("#ff0000", "#0000ff"), colors("#cf0000", "#e0e0e0"))).toEqual({
      a: RED,
      b: INK,
    })
  })

  it("gives Dover red and New Philadelphia ink", () => {
    expect(lineColors(colors("#ff0000", "#e0e0e0"), colors("#ff0000", "#000000"))).toEqual({
      a: RED,
      b: INK,
    })
  })

  it("gives Massillon orange and Canton McKinley red", () => {
    expect(lineColors(colors("#ffa500", "#000000"), colors("#ff0000", "#000000"))).toEqual({
      a: { light: "#b87600", dark: "#ffa500" },
      b: RED,
    })
  })

  it("gives Wooster blue and Orrville red", () => {
    expect(lineColors(colors("#0000ff", "#ffd700"), colors("#ff0000", "#ffffff"))).toEqual({
      a: { light: "#0000ff", dark: "#447cff" },
      b: RED,
    })
  })

  it("gives both sides the defaults when no color of b differs and amber is too close to red", () => {
    expect(lineColors(colors("#ff0000", "#ff0000"), colors("#ff0000", "#ff0000"))).toEqual({
      a: DEFAULT_A,
      b: DEFAULT_B,
    })
  })

  it("gives b amber when its colors are too close to a and amber is not", () => {
    expect(lineColors(colors("#0000ff", null), colors("#0000ff", "#0000ff"))).toEqual({
      a: { light: "#0000ff", dark: "#447cff" },
      b: DEFAULT_B,
    })
    expect(lineColors(colors("#0000ff", null), colors(null, null))).toEqual({
      a: { light: "#0000ff", dark: "#447cff" },
      b: DEFAULT_B,
    })
  })

  it("uses the secondary color of a when its primary color is missing", () => {
    expect(lineColors(colors(null, "#ff0000"), colors("#0000ff", null)).a).toEqual(RED)
  })

  it("gives a the default when it has no color, and b still checks against it", () => {
    expect(lineColors(colors(null, null), colors("#ff0000", null))).toEqual({
      a: DEFAULT_A,
      b: RED,
    })
    // The default blue of a and a blue of b are too close, so b goes on to its secondary color.
    expect(lineColors(colors(null, null), colors("#2b5fd9", "#ff0000")).b).toEqual(RED)
  })

  it("colors a side alone by its own colors", () => {
    expect(lineColors(colors("#ff0000", null), null)).toEqual({ a: RED, b: DEFAULT_B })
    expect(lineColors(null, colors("#cf0000", "#e0e0e0")).b).toEqual({
      light: themeColor("#cf0000", "light"),
      dark: themeColor("#cf0000", "dark"),
    })
    expect(lineColors(null, colors(null, "#000000")).b).toEqual(INK)
    expect(lineColors(null, colors(null, null))).toEqual({ a: DEFAULT_A, b: DEFAULT_B })
  })

  it("gives the defaults with no school", () => {
    expect(lineColors(null, null)).toEqual({ a: DEFAULT_A, b: DEFAULT_B })
  })

  it("does not use a value that is not #rrggbb", () => {
    expect(lineColors(colors('#ff0000" }', "RED"), null)).toEqual({ a: DEFAULT_A, b: DEFAULT_B })
    expect(lineColors(colors('#ff0000" }', "#ff0000"), null).a).toEqual(RED)
  })

  it("keeps the color with the school and the dash with the side when the sides swap", () => {
    const massillon = colors("#ffa500", "#000000")
    const mckinley = colors("#ff0000", "#000000")
    const forward = lineColors(massillon, mckinley)
    const swapped = lineColors(mckinley, massillon)

    expect(swapped).toEqual({ a: forward.b, b: forward.a })
  })
})
