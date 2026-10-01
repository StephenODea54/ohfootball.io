import { geoMercator } from "d3-geo"
import { describe, expect, it } from "vitest"
import { MAP_WIDTH, ohioMap, readCounties } from "@/features/map/server/ohio-map"
import { project } from "@/features/map/utils/projection"

const map = ohioMap()

describe("ohioMap", () => {
  it("fills the width and keeps the shape of the state", () => {
    expect(map.width).toBe(MAP_WIDTH)
    expect(map.height).toBeGreaterThan(1000)
    expect(map.height).toBeLessThan(1200)
  })

  it("draws the county lines and the regions with one decimal at most", () => {
    const paths = [map.countyBorders, ...map.regions.map((region) => region.path)]
    for (const path of paths) {
      expect(path.startsWith("M")).toBe(true)
      expect(path).not.toMatch(/\d\.\d\d/)
    }
    expect(paths.join("").length).toBeLessThan(120_000)
  })

  it("draws each region with a middle inside the map", () => {
    expect(map.regions.map((region) => region.key)).toEqual(["nw", "ne", "central", "sw", "se"])
    for (const region of map.regions) {
      expect(region.path.startsWith("M")).toBe(true)
      expect(region.center.x).toBeGreaterThan(0)
      expect(region.center.x).toBeLessThan(map.width)
    }
  })

  it("keeps only the 88 Ohio counties", () => {
    const counties = readCounties().objects.counties.geometries.filter((county) =>
      String(county.id).startsWith("39"),
    )
    expect(counties).toHaveLength(88)
  })

  it("places a point where a fitted d3 projection would", () => {
    const columbus = project(map.fit, -82.999, 39.961)
    expect(columbus.x).toBeGreaterThan(0)
    expect(columbus.x).toBeLessThan(map.width)
    expect(columbus.y).toBeGreaterThan(0)
    expect(columbus.y).toBeLessThan(map.height)

    const cleveland = project(map.fit, -81.694, 41.499)
    const cincinnati = project(map.fit, -84.512, 39.103)
    expect(cincinnati.x).toBeLessThan(cleveland.x)
    expect(cincinnati.y).toBeGreaterThan(cleveland.y)

    // The fit holds the same Mercator projection that drew the counties.
    const scale = map.fit.scale / (2 * Math.PI)
    const d3 = geoMercator()
      .scale(scale)
      .translate([map.fit.x + Math.PI * scale, map.fit.y + Math.PI * scale])
    const [x, y] = d3([-82.999, 39.961]) as [number, number]
    expect(columbus.x).toBeCloseTo(x, 6)
    expect(columbus.y).toBeCloseTo(y, 6)
  })
})
