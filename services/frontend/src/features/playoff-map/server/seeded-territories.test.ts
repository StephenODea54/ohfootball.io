import { describe, expect, it } from "vitest"
import { areaShape, pathRings, pointInRings } from "@/features/map/utils/polygon"
import { seededTerritories } from "@/features/playoff-map/server/seeded-territories"

const box = areaShape(["M0,0L100,0L100,100L0,100Z"])

describe("seededTerritories", () => {
  it("gives no cell when there is no school", () => {
    expect(seededTerritories([], box, [0, 0, 100, 100])).toEqual([])
  })

  it("gives one school all the land and a circle in the middle", () => {
    const [only] = seededTerritories([{ id: "a", seed: 1, x: 20, y: 20 }], box, [0, 0, 100, 100])

    expect(only.id).toBe("a")
    expect(only.land).toBe(10_000)
    expect(only.path.startsWith("M")).toBe(true)
    expect(only.circle.r).toBeGreaterThan(40)
    expect(only.circle.r).toBeLessThan(50)
  })

  it("gives the better seed more land, with a straight shared border for equal seeds", () => {
    const even = seededTerritories(
      [
        { id: "w", seed: 3, x: 20, y: 50 },
        { id: "e", seed: 3, x: 80, y: 50 },
      ],
      box,
      [0, 0, 100, 100],
    )
    expect(even.map((cell) => cell.land)).toEqual([5000, 5000])
    // The shared border of two schools is one straight line after the simplification.
    for (const cell of even) expect(pathRings(cell.path)[0].length).toBeLessThanOrEqual(6)

    const [big, small] = seededTerritories(
      [
        { id: "top", seed: 1, x: 20, y: 50 },
        { id: "low", seed: 12, x: 80, y: 50 },
      ],
      box,
      [0, 0, 100, 100],
    )
    expect(big.id).toBe("top")
    expect(big.land).toBeGreaterThan(small.land * 2)
    expect(big.land + small.land).toBe(10_000)
    // The weak seed keeps the land around its school.
    expect(pointInRings(pathRings(small.path), { x: 80, y: 50 })).toBe(true)
  })

  it("leaves out a school with no land, and keeps land outside the area at no size", () => {
    const cells = seededTerritories(
      [
        { id: "a", seed: 1, x: 50, y: 90 },
        { id: "twin", seed: 2, x: 50, y: 90 },
        { id: "far", seed: 12, x: 50, y: 106 },
      ],
      box,
      [0, 0, 100, 100],
    )

    expect(cells.map((cell) => cell.id)).toEqual(["a", "far"])
    const far = cells[1]
    expect(far.land).toBe(0)
    expect(far.circle).toEqual({ x: 50, y: 106, r: 0 })
  })

  it("splits a region of 12 schools in good time", () => {
    const area = areaShape(["M0,0L600,0L600,500L0,500Z"])
    const schools = Array.from({ length: 12 }, (_, index) => ({
      id: `s${index}`,
      seed: index + 1,
      x: 40 + ((index * 137) % 520),
      y: 30 + ((index * 89) % 440),
    }))

    const started = performance.now()
    const cells = seededTerritories(schools, area, [0, 0, 600, 500])

    expect(performance.now() - started).toBeLessThan(2000)
    expect(cells).toHaveLength(12)
    expect(cells.reduce((sum, cell) => sum + cell.land, 0)).toBe(300_000)
    expect(cells.reduce((sum, cell) => sum + cell.path.length, 0)).toBeLessThan(20_000)
  })
})
