import { describe, expect, it } from "vitest"
import { mercatorX, mercatorY, project } from "@/features/map/utils/projection"

describe("the Web Mercator unit square", () => {
  it("puts the prime meridian and the equator in the middle", () => {
    expect(mercatorX(0)).toBe(0.5)
    expect(mercatorY(0)).toBe(0.5)
  })

  it("puts east to the right and north up", () => {
    expect(mercatorX(-80)).toBeGreaterThan(mercatorX(-84))
    expect(mercatorY(42)).toBeLessThan(mercatorY(38))
  })

  it("scales and moves a point onto the map", () => {
    expect(project({ scale: 1000, x: -10, y: 20 }, 0, 0)).toEqual({ x: 490, y: 520 })
  })
})
