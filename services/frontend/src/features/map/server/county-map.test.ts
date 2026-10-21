import { describe, expect, it } from "vitest"
import { countyMap } from "@/features/map/server/county-map"
import { ohioMap } from "@/features/map/server/ohio-map"

const teams = [
  { county: "Cuyahoga", division: 1, region: 1 },
  { county: "Hamilton", division: 1, region: 4 },
  { county: "Stark", division: 2, region: 7 },
  { county: null, division: null, region: null },
]

const map = countyMap(teams)

describe("countyMap", () => {
  it("draws the 88 counties A to Z with one decimal at most", () => {
    const names = map.counties.map((county) => county.name)

    expect(names).toHaveLength(88)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    for (const county of map.counties) {
      expect(county.path.startsWith("M")).toBe(true)
      expect(county.path).not.toMatch(/\d\.\d\d/)
    }
    expect(map.outline.startsWith("M")).toBe(true)
  })

  it("gives each county a box inside the map", () => {
    for (const { bounds } of map.counties) {
      const [minX, minY, maxX, maxY] = bounds
      expect(minX).toBeGreaterThanOrEqual(0)
      expect(minY).toBeGreaterThanOrEqual(0)
      expect(maxX).toBeLessThanOrEqual(map.width)
      expect(maxY).toBeLessThanOrEqual(map.height)
      expect(maxX).toBeGreaterThan(minX)
    }
  })

  it("gives each county the region of its schools, by division", () => {
    const index = (name: string) => map.counties.findIndex((county) => county.name === name)

    expect(Object.keys(map.regions)).toEqual(["1", "2"])
    expect(map.regions[1]).toHaveLength(88)
    expect(map.regions[1][index("Cuyahoga")]).toBe(1)
    expect(map.regions[1][index("Hamilton")]).toBe(4)
    // Butler has no school here, so it takes the region of the nearest county with one.
    expect(map.regions[1][index("Butler")]).toBe(4)
    expect(new Set(map.regions[2])).toEqual(new Set([7]))
  })

  it("uses the size and the projection of the map of the home page", () => {
    const home = ohioMap()

    expect(map.width).toBe(home.width)
    expect(map.height).toBe(home.height)
    expect(map.fit).toEqual(home.fit)
  })
})
