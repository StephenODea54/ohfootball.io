import { describe, expect, it } from "vitest"
import { areaShape } from "@/features/map/utils/polygon"
import { inscribedCircle, polygonPath, territories } from "@/features/map/utils/territories"
import type { Bounds } from "@/features/map/utils/zoom"

const bounds: Bounds = [0, 0, 100, 100]
const box = areaShape(["M0,0L100,0L100,100L0,100Z"])

describe("territories", () => {
  it("gives one school the whole box", () => {
    const [only] = territories([{ id: "a", x: 30, y: 40 }], bounds, box)

    expect(only.id).toBe("a")
    expect(only.polygon).toHaveLength(4)
    expect(only.circle).toEqual({ x: 50, y: 50, r: 50 })
  })

  it("splits the box between two schools on the line halfway between them", () => {
    const [west, east] = territories(
      [
        { id: "w", x: 20, y: 50 },
        { id: "e", x: 80, y: 50 },
      ],
      bounds,
      box,
    )

    expect(Math.max(...west.polygon.map((point) => point.x))).toBeCloseTo(50, 9)
    expect(Math.min(...east.polygon.map((point) => point.x))).toBeCloseTo(50, 9)
    expect(west.circle.r).toBeCloseTo(25, 9)
  })

  it("gives no territory to a school on the spot of another, and does not fail", () => {
    const cells = territories(
      [
        { id: "a", x: 50, y: 50 },
        { id: "b", x: 50, y: 50 },
      ],
      bounds,
      box,
    )

    expect(cells.map((cell) => cell.id)).toEqual(["a"])
  })

  it("splits the box for schools on one line", () => {
    const cells = territories(
      [
        { id: "a", x: 10, y: 10 },
        { id: "b", x: 50, y: 50 },
        { id: "c", x: 90, y: 90 },
      ],
      bounds,
      box,
    )

    expect(cells).toHaveLength(3)
  })

  it("gives a school outside the area a territory, with a circle of no size at the school", () => {
    const corner = areaShape(["M0,0L40,0L40,40L0,40Z"])
    const cells = territories(
      [
        { id: "in", x: 20, y: 20 },
        { id: "out", x: 90, y: 90 },
      ],
      bounds,
      corner,
    )
    const out = cells.find((cell) => cell.id === "out")

    expect(out?.circle).toEqual({ x: 90, y: 90, r: 0 })
    expect(cells.find((cell) => cell.id === "in")?.circle.r).toBeGreaterThan(0)
  })

  it("gives nothing for no schools", () => {
    expect(territories([], bounds, box)).toEqual([])
  })
})

describe("polygonPath", () => {
  it("writes a closed path with one decimal", () => {
    expect(
      polygonPath([
        { x: 0.04, y: 1.26 },
        { x: 10, y: 0 },
        { x: 5, y: 5 },
      ]),
    ).toBe("M0,1.3L10,0L5,5Z")
    expect(polygonPath([])).toBe("")
  })
})

describe("inscribedCircle", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 40 },
    { x: 0, y: 40 },
  ]

  it("fits the circle of a square around its middle", () => {
    expect(inscribedCircle(square, [{ x: 20, y: 20 }], box)).toEqual({ x: 20, y: 20, r: 20 })
  })

  it("keeps the candidate with the largest circle", () => {
    const circle = inscribedCircle(
      square,
      [
        { x: 5, y: 5 },
        { x: 20, y: 20 },
        { x: 30, y: 10 },
      ],
      box,
    )

    expect(circle).toEqual({ x: 20, y: 20, r: 20 })
  })

  it("leaves out a candidate outside the area, and keeps off the edge of the area", () => {
    const corner = areaShape(["M0,0L15,0L15,15L0,15Z"])
    const circle = inscribedCircle(
      square,
      [
        { x: 20, y: 20 },
        { x: 10, y: 10 },
      ],
      corner,
    )

    expect(circle).toEqual({ x: 10, y: 10, r: 5 })
  })

  it("has no size when no candidate is inside the area", () => {
    expect(inscribedCircle(square, [{ x: 200, y: 200 }], box)).toEqual({ x: 200, y: 200, r: 0 })
    expect(inscribedCircle(square, [], box)).toEqual({ x: 0, y: 0, r: 0 })
  })
})
