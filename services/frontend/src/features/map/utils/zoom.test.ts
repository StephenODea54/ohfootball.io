import { describe, expect, it } from "vitest"
import {
  easeInOutCubic,
  interpolateViewBox,
  MIN_VIEW,
  pointBounds,
  screenPoint,
  unionBounds,
  type ViewBox,
  viewBoxAttribute,
  viewBoxFor,
  wholeMap,
} from "@/features/map/utils/zoom"

const map = { width: 1000, height: 1084 }
const aspect = map.width / map.height

describe("unionBounds", () => {
  it("is null for no boxes", () => {
    expect(unionBounds([])).toBeNull()
  })

  it("holds every box and every point", () => {
    expect(unionBounds([[10, 20, 30, 40], pointBounds({ x: 5, y: 50 }), [12, 0, 18, 4]])).toEqual([
      5, 0, 30, 50,
    ])
  })
})

describe("viewBoxFor", () => {
  it("shows the whole map with no box", () => {
    expect(viewBoxFor(null, map)).toEqual(wholeMap(map))
  })

  it("keeps the shape of the map and the box in the middle", () => {
    const view = viewBoxFor([400, 400, 700, 500], map)

    expect(view.width / view.height).toBeCloseTo(aspect, 9)
    expect(view.x + view.width / 2).toBeCloseTo(550, 9)
    expect(view.y + view.height / 2).toBeCloseTo(450, 9)
    // The box is 300 wide, and the room on each side is 6% of that.
    expect(view.width).toBeCloseTo(336, 9)
  })

  it("gives a tall box room above and below", () => {
    const view = viewBoxFor([500, 200, 520, 700], map)

    expect(view.height).toBeCloseTo(500 + 2 * 30, 9)
    expect(view.width).toBeCloseTo(view.height * aspect, 9)
  })

  it("never zooms in past the smallest view, even on one point", () => {
    const view = viewBoxFor(pointBounds({ x: 500, y: 500 }), map)

    expect(view.width).toBeCloseTo(MIN_VIEW, 9)
    expect(view.height).toBeCloseTo(MIN_VIEW / aspect, 9)
  })

  it("keeps the box in the middle near an edge, past the edge of the map", () => {
    const view = viewBoxFor([0, 0, 40, 40], map)

    expect(view.x + view.width / 2).toBeCloseTo(20, 9)
    expect(view.y + view.height / 2).toBeCloseTo(20, 9)
    expect(view.x).toBeLessThan(0)
  })

  it("shows the whole map for a box as large as the map", () => {
    expect(viewBoxFor([0, 0, 1000, 1084], map)).toEqual(wholeMap(map))
  })
})

describe("easeInOutCubic", () => {
  it("starts slow, ends slow, and passes the middle at one half", () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(0.5)).toBe(0.5)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1)
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9)
  })
})

describe("interpolateViewBox", () => {
  const whole = wholeMap(map)
  const corner: ViewBox = { x: 700, y: 50, width: 250, height: 250 / aspect }

  it("starts at the first view and ends at the last", () => {
    const zoom = interpolateViewBox(whole, corner)

    expect(zoom.at(0)).toBe(whole)
    expect(zoom.at(1)).toBe(corner)
    expect(zoom.at(-1)).toBe(whole)
    expect(zoom.at(2)).toBe(corner)
  })

  it("keeps the shape of the map at each step and moves the middle toward the target", () => {
    const zoom = interpolateViewBox(whole, corner)
    let lastX = whole.x + whole.width / 2
    for (const t of [0.25, 0.5, 0.75]) {
      const view = zoom.at(t)
      expect(view.width / view.height).toBeCloseTo(aspect, 9)
      expect(view.width).toBeLessThan(whole.width)
      expect(view.width).toBeGreaterThan(corner.width)
      const middle = view.x + view.width / 2
      expect(middle).toBeGreaterThan(lastX)
      lastX = middle
    }
  })

  it("pulls back on a long trip between two small views", () => {
    const west: ViewBox = { x: 0, y: 400, width: 240, height: 240 / aspect }
    const east: ViewBox = { x: 760, y: 400, width: 240, height: 240 / aspect }
    const zoom = interpolateViewBox(west, east)

    expect(zoom.at(0.5).width).toBeGreaterThan(240)
    expect(zoom.durationMs).toBeGreaterThan(interpolateViewBox(whole, corner).durationMs)
  })

  it("zooms in place when the views share a middle", () => {
    const inner: ViewBox = { x: 250, y: 271, width: 500, height: 542 }
    const zoom = interpolateViewBox(whole, inner)
    const view = zoom.at(0.5)

    expect(view.x + view.width / 2).toBeCloseTo(500, 9)
    expect(view.width).toBeCloseTo(Math.sqrt(1000 * 500), 6)
  })

  it("takes a short time for a small change, and never too long", () => {
    const near: ViewBox = { ...corner, x: corner.x + 1 }
    expect(interpolateViewBox(corner, near).durationMs).toBe(600)
    const far: ViewBox = { x: 0, y: 0, width: 1, height: 1 / aspect }
    expect(interpolateViewBox(whole, far).durationMs).toBe(1200)
  })
})

describe("viewBoxAttribute", () => {
  it("writes one decimal at most", () => {
    expect(viewBoxAttribute({ x: 1.26, y: -0.01, width: 240, height: 260.333 })).toBe(
      "1.3 0 240 260.3",
    )
  })
})

describe("screenPoint", () => {
  it("places a map point in the box on the screen", () => {
    const view = { x: 100, y: 200, width: 250, height: 271 }

    expect(screenPoint({ x: 100, y: 200 }, view, 500)).toEqual({ x: 0, y: 0 })
    expect(screenPoint({ x: 225, y: 300 }, view, 500)).toEqual({ x: 250, y: 200 })
  })
})
