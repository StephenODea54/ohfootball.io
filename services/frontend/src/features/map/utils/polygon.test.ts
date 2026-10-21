import { describe, expect, it } from "vitest"
import {
  areaShape,
  centroid,
  distanceToSegment,
  pathRings,
  pointInRings,
  polygonSegments,
} from "@/features/map/utils/polygon"

const square = "M0,0L10,0L10,10L0,10Z"

describe("pathRings", () => {
  it("reads each ring of a path", () => {
    expect(pathRings(`${square}M2,2L4,2L4,4Z`)).toEqual([
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      [
        { x: 2, y: 2 },
        { x: 4, y: 2 },
        { x: 4, y: 4 },
      ],
    ])
    expect(pathRings("")).toEqual([])
  })
})

describe("pointInRings", () => {
  const rings = pathRings(`${square}M2,2L4,2L4,4L2,4Z`)

  it("finds a point inside, outside, and in a hole", () => {
    expect(pointInRings(rings, { x: 8, y: 8 })).toBe(true)
    expect(pointInRings(rings, { x: 12, y: 5 })).toBe(false)
    expect(pointInRings(rings, { x: 3, y: 3 })).toBe(false)
  })
})

describe("centroid", () => {
  it("finds the middle of the area", () => {
    expect(centroid(pathRings(square)[0])).toEqual({ x: 5, y: 5 })
  })

  it("gives the mean of the corners for a polygon with no area", () => {
    expect(
      centroid([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ]),
    ).toEqual({ x: 2, y: 0 })
    expect(centroid([])).toEqual({ x: 0, y: 0 })
  })
})

describe("distanceToSegment", () => {
  it("measures to the nearest point of the line", () => {
    const line: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]
    expect(distanceToSegment({ x: 5, y: 3 }, line)).toBe(3)
    expect(distanceToSegment({ x: 13, y: 4 }, line)).toBe(5)
    expect(distanceToSegment({ x: 3, y: 4 }, [line[0], line[0]])).toBe(5)
  })
})

describe("polygonSegments", () => {
  it("joins the last corner to the first", () => {
    expect(polygonSegments(pathRings(square)[0]).at(-1)).toEqual([
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ])
  })
})

describe("areaShape", () => {
  it("keeps the outer edge and leaves out the border of two counties", () => {
    const area = areaShape([square, "M10,0L20,0L20,10L10,10Z"])

    expect(area.rings).toHaveLength(2)
    expect(area.edges).toHaveLength(6)
    expect(
      area.edges.some(([a, b]) => a.x === 10 && b.x === 10 && Math.abs(a.y - b.y) === 10),
    ).toBe(false)
  })

  it("skips a side of no length", () => {
    expect(areaShape(["M0,0L0,0L10,0L10,10Z"]).edges).toHaveLength(3)
  })
})
