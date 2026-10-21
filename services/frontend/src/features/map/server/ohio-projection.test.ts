import { feature } from "topojson-client"
import { describe, expect, it } from "vitest"
import {
  countyName,
  fitOhio,
  ohioCounties,
  readCounties,
} from "@/features/map/server/ohio-projection"

const topology = readCounties()

describe("ohioCounties", () => {
  it("keeps the 88 Ohio counties", () => {
    const counties = ohioCounties(topology)

    expect(counties.geometries).toHaveLength(88)
    expect(counties.geometries.map(countyName)).toContain("Van Wert")
  })
})

describe("countyName", () => {
  it("is empty for a county with no name", () => {
    expect(countyName({})).toBe("")
    expect(countyName({ properties: null })).toBe("")
  })
})

describe("fitOhio", () => {
  it("fills the width with the margin on each side", () => {
    const counties = ohioCounties(topology)
    const { path, height } = fitOhio(topology, counties, 400, 8)
    const [[left, top], [right, bottom]] = path.bounds(feature(topology, counties))

    expect(left).toBeCloseTo(8, 0)
    expect(right).toBeCloseTo(392, 0)
    expect(top).toBeCloseTo(8, 0)
    expect(height).toBe(Math.ceil(bottom + 8))
  })
})
