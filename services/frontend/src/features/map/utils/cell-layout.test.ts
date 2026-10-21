import { describe, expect, it } from "vitest"
import { cellLayout, pillAnchor, pillWidth, visiblePills } from "@/features/map/utils/cell-layout"

describe("cellLayout", () => {
  it("shows a large logo, wider than the circle, in a large territory", () => {
    expect(cellLayout({ x: 0, y: 0, r: 50 }, 1, 1000)).toEqual({
      logo: { size: 160, file: "large" },
      compactPill: false,
    })
  })

  it("uses the small file for a small logo, with a smaller badge", () => {
    expect(cellLayout({ x: 0, y: 0, r: 10 }, 1, 1000)).toEqual({
      logo: { size: 32, file: "small" },
      compactPill: true,
    })
  })

  it("leaves out the logo in a small territory", () => {
    expect(cellLayout({ x: 0, y: 0, r: 7 }, 1, 1000)).toEqual({ logo: null, compactPill: true })
    expect(cellLayout({ x: 0, y: 0, r: 14 }, 2, 1000).logo).toBeNull()
  })

  it("keeps the logo of a huge territory to a share of the view", () => {
    expect(cellLayout({ x: 0, y: 0, r: 500 }, 1, 200).logo?.size).toBeCloseTo(70, 9)
  })
})

describe("pillAnchor", () => {
  const circle = { x: 50, y: 60, r: 20 }
  const school = { x: 10, y: 15 }

  it("hangs the rank below the middle of a territory with a logo", () => {
    expect(
      pillAnchor(circle, school, { logo: { size: 40, file: "small" }, compactPill: false }),
    ).toEqual({ x: 50, y: 76 })
  })

  it("puts the rank at the school when the territory has no room for a logo", () => {
    expect(pillAnchor(circle, school, { logo: null, compactPill: true })).toBe(school)
  })
})

describe("pillWidth", () => {
  it("grows with the digits of the rank", () => {
    expect(pillWidth(7)).toBeCloseTo(23.2, 9)
    expect(pillWidth(123)).toBeCloseTo(36.4, 9)
  })
})

describe("visiblePills", () => {
  it("keeps each badge that covers no better badge", () => {
    const shown = visiblePills(
      [
        { id: "c", rank: 30, at: { x: 0, y: 0 }, compact: false },
        { id: "a", rank: 3, at: { x: 10, y: 5 }, compact: false },
        { id: "b", rank: 9, at: { x: 200, y: 0 }, compact: true },
      ],
      1,
    )

    expect([...shown].sort()).toEqual(["a", "b"])
  })

  it("lets badges fit closer on a map that is zoomed in", () => {
    const pills = [
      { id: "a", rank: 3, at: { x: 0, y: 0 }, compact: false },
      { id: "b", rank: 9, at: { x: 20, y: 0 }, compact: false },
    ]

    expect(visiblePills(pills, 1).size).toBe(1)
    expect(visiblePills(pills, 0.25).size).toBe(2)
  })
})
