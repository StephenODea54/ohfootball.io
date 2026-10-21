import { describe, expect, it } from "vitest"
import { chroma, distance, fromOklch, hexToOklab, inGamut, oklabToHex, toGamut } from "@/lib/oklab"

/** The hue of a color in degrees. */
function hue({ a, b }: { a: number; b: number }) {
  return (Math.atan2(b, a) * 180) / Math.PI
}

describe("hexToOklab", () => {
  it("gives the values of the OKLab article", () => {
    const red = hexToOklab("#ff0000")
    expect(red.l).toBeCloseTo(0.628, 3)
    expect(red.a).toBeCloseTo(0.2249, 3)
    expect(red.b).toBeCloseTo(0.1258, 3)
    expect(hexToOklab("#ffffff").l).toBeCloseTo(1, 4)
    expect(hexToOklab("#000000").l).toBe(0)
  })

  it("gives no chroma for a gray", () => {
    expect(chroma(hexToOklab("#808080"))).toBeLessThan(1e-4)
    expect(chroma(hexToOklab("#e0e0e0"))).toBeLessThan(1e-4)
  })

  it("reads a dark channel on the straight part of the sRGB curve", () => {
    expect(hexToOklab("#010101").l).toBeGreaterThan(0)
  })
})

describe("oklabToHex", () => {
  it("gives back the color it was made from", () => {
    for (const hex of [
      "#ff0000",
      "#0000ff",
      "#006836",
      "#ffa500",
      "#000000",
      "#ffffff",
      "#810541",
    ]) {
      expect(oklabToHex(hexToOklab(hex)), hex).toBe(hex)
    }
  })

  it("cuts a channel out of the gamut to 0 or 1", () => {
    expect(oklabToHex({ l: 2, a: 0, b: 0 })).toBe("#ffffff")
    expect(oklabToHex({ l: -1, a: 0, b: 0 })).toBe("#000000")
  })
})

describe("fromOklch", () => {
  it("turns a chroma and a hue into a and b", () => {
    const color = fromOklch(0.5, 0.1, 90)
    expect(color.l).toBe(0.5)
    expect(color.a).toBeCloseTo(0, 10)
    expect(color.b).toBeCloseTo(0.1, 10)
    expect(chroma(fromOklch(0.628, 0.2577, 29.23))).toBeCloseTo(0.2577, 10)
  })
})

describe("inGamut and toGamut", () => {
  it("keeps a color that sRGB can show", () => {
    const red = hexToOklab("#ff0000")
    expect(inGamut(red)).toBe(true)
    expect(toGamut(red)).toBe(red)
  })

  it("lowers the chroma of a color out of the gamut and keeps its hue and lightness", () => {
    const red = hexToOklab("#ff0000")
    const dark = { ...red, l: 0.4 }
    expect(inGamut(dark)).toBe(false)

    const fitted = toGamut(dark)
    expect(inGamut(fitted)).toBe(true)
    expect(fitted.l).toBe(0.4)
    expect(hue(fitted)).toBeCloseTo(hue(red), 10)
    expect(chroma(fitted)).toBeLessThan(chroma(red))
    // The search finds the edge of the gamut, so a little more chroma is out of it.
    expect(inGamut({ l: 0.4, a: fitted.a * 1.01, b: fitted.b * 1.01 })).toBe(false)
  })
})

describe("distance", () => {
  it("is 0 for one color and grows with the change", () => {
    const red = hexToOklab("#ff0000")
    expect(distance(red, red)).toBe(0)
    expect(distance(red, hexToOklab("#cf0000"))).toBeCloseTo(0.099, 2)
    expect(distance(hexToOklab("#000000"), hexToOklab("#ffffff"))).toBeCloseTo(1, 3)
  })
})
