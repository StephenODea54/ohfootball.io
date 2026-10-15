import { describe, expect, it } from "vitest"
import { assignCounties, playoffMap } from "@/features/playoffs/server/region-map"

describe("assignCounties", () => {
  const names = ["A", "B", "C", "D"]
  const centers: [number, number][] = [
    [0, 0],
    [10, 0],
    [0, 10],
    [100, 100],
  ]

  it("gives a county the region of most of its schools, and the lower region on a tie", () => {
    const teams = [
      { county: "A", division: 1, region: 2 },
      { county: "A", division: 1, region: 1 },
      { county: "A", division: 1, region: 1 },
      { county: "B", division: 1, region: 3 },
      { county: "B", division: 1, region: 4 },
      { county: "D", division: 1, region: 4 },
    ]

    expect(assignCounties(names, centers, teams)).toEqual([1, 3, 1, 4])
  })

  it("leaves every county without a region when no school has one", () => {
    expect(assignCounties(names, centers, [{ county: null, division: 1, region: null }])).toEqual([
      null,
      null,
      null,
      null,
    ])
  })
})

describe("playoffMap", () => {
  it("draws the regions of each division from the counties of its schools", () => {
    const teams = [
      { county: "Cuyahoga", division: 1, region: 1 },
      { county: "Lucas", division: 1, region: 2 },
      { county: "Franklin", division: 1, region: 3 },
      { county: "Hamilton", division: 1, region: 4 },
      { county: "Franklin", division: 2, region: 7 },
      { county: null, division: null, region: null },
    ]

    const map = playoffMap(teams)

    expect(Object.keys(map.divisions)).toEqual(["1", "2"])
    expect(map.divisions[1].map((shape) => shape.region)).toEqual([1, 2, 3, 4])
    expect(map.divisions[2].map((shape) => shape.region)).toEqual([7])
    for (const shape of map.divisions[1]) {
      expect(shape.path.startsWith("M")).toBe(true)
      expect(shape.label.x).toBeGreaterThan(0)
      expect(shape.label.x).toBeLessThan(map.width)
    }
    expect(map.outline.startsWith("M")).toBe(true)
    expect(map.height).toBeGreaterThan(map.width)
  })
})
