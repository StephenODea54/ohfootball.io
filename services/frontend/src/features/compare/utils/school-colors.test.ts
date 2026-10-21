import { describe, expect, it } from "vitest"
import {
  isHexColor,
  parseSchoolColor,
  readSchoolColors,
  toSchoolColors,
} from "@/features/compare/utils/school-colors"

describe("parseSchoolColor", () => {
  it("keeps a #rrggbb color in lowercase", () => {
    expect(parseSchoolColor("#FF0000")).toBe("#ff0000")
    expect(parseSchoolColor("#9b30ff")).toBe("#9b30ff")
    expect(parseSchoolColor(" #006836 ")).toBe("#006836")
  })

  it("makes a #rgb color long", () => {
    expect(parseSchoolColor("#F0a")).toBe("#ff00aa")
  })

  it("reads a color name in any case", () => {
    expect(parseSchoolColor("White")).toBe("#ffffff")
    expect(parseSchoolColor("GOLD")).toBe("#ffd700")
    expect(parseSchoolColor("grey")).toBe("#808080")
    expect(parseSchoolColor("gray")).toBe("#808080")
    expect(parseSchoolColor("navy")).toBe("#000080")
  })

  it("gives null for a value that is not a color", () => {
    for (const raw of [
      null,
      "",
      "HI-LITE",
      "#ff00",
      "#ff00000",
      "#gg0000",
      "rgb(255, 0, 0)",
      "constructor",
      "toString",
      "crimson",
      '#ff0000" }',
      "#ff0000;}body{color:red",
      "red</style>",
    ]) {
      expect(parseSchoolColor(raw), String(raw)).toBeNull()
    }
  })
})

describe("isHexColor", () => {
  it("allows only #rrggbb in lowercase", () => {
    expect(isHexColor("#a1b2c3")).toBe(true)
    for (const value of ["#A1B2C3", "#abc", "red", '#ff0000" }', " #ff0000", 0xff0000, null, {}]) {
      expect(isHexColor(value), String(value)).toBe(false)
    }
  })
})

describe("toSchoolColors", () => {
  it("parses both colors of a team", () => {
    expect(toSchoolColors({ primaryColor: "#CF0000", secondaryColor: "white" })).toEqual({
      primary: "#cf0000",
      secondary: "#ffffff",
    })
    expect(toSchoolColors({ primaryColor: "HI", secondaryColor: null })).toEqual({
      primary: null,
      secondary: null,
    })
  })
})

describe("readSchoolColors", () => {
  it("keeps the colors of a new file", () => {
    expect(readSchoolColors({ primary: "#ff0000", secondary: null })).toEqual({
      primary: "#ff0000",
      secondary: null,
    })
  })

  it("reads an uppercase color, and drops a value that is not text", () => {
    expect(readSchoolColors({ primary: "#FF0000", secondary: 7 })).toEqual({
      primary: "#ff0000",
      secondary: null,
    })
  })

  it("gives no colors for an old file without them", () => {
    for (const value of [undefined, null, "red", 7]) {
      expect(readSchoolColors(value)).toEqual({ primary: null, secondary: null })
    }
  })

  it("drops a value that could break out of the style of the chart", () => {
    expect(readSchoolColors({ primary: '#ff0000" }', secondary: "red;}*{x:y" })).toEqual({
      primary: null,
      secondary: null,
    })
    expect(readSchoolColors({ primary: 0xff0000, secondary: ["#ff0000"] })).toEqual({
      primary: null,
      secondary: null,
    })
  })
})
