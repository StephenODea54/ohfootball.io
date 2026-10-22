import { describe, expect, it } from "vitest"
import { straighten, traceRings } from "@/features/playoff-map/server/trace"

/** The area of a closed ring. It is positive when the ring goes clockwise on the screen. */
function area(ring: [number, number][]) {
  let sum = 0
  for (let i = 0; i + 1 < ring.length; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return sum / 2
}

describe("traceRings", () => {
  it("traces one cell as a square in map units", () => {
    const rings = traceRings(new Int16Array([0]), { x: 10, y: 20, columns: 1, rows: 1 })

    expect(rings.get(0)).toEqual([
      [
        [10, 20],
        [11, 20],
        [11, 21],
        [10, 21],
        [10, 20],
      ],
    ])
  })

  it("traces two labels side by side with one shared edge and skips a cell of no label", () => {
    const rings = traceRings(new Int16Array([0, 0, 1, -1]), { x: 0, y: 0, columns: 4, rows: 1 })

    expect([...rings.keys()]).toEqual([0, 1])
    expect(rings.get(0)?.[0]).toContainEqual([2, 1])
    expect(rings.get(0)?.[0]).toHaveLength(5)
    expect(rings.get(1)?.[0]).toContainEqual([2, 0])
    expect(area(rings.get(0)?.[0] ?? [])).toBe(2)
    expect(area(rings.get(1)?.[0] ?? [])).toBe(1)
  })

  it("traces a hole as a second ring that goes the other way, and the cell in it as its own ring", () => {
    const labels = new Int16Array([0, 0, 0, 0, 1, 0, 0, 0, 0])
    const rings = traceRings(labels, { x: 0, y: 0, columns: 3, rows: 3 })

    const outer = rings.get(0) ?? []
    expect(outer).toHaveLength(2)
    expect(outer.map(area).sort((a, b) => a - b)).toEqual([-1, 9])
    expect(rings.get(1)?.map(area)).toEqual([1])
  })

  it("closes the rings of two cells that touch only at a corner", () => {
    const labels = new Int16Array([0, 1, 1, 0])
    const rings = traceRings(labels, { x: 0, y: 0, columns: 2, rows: 2 })

    const total = (rings.get(0) ?? []).reduce((sum, ring) => sum + area(ring), 0)
    expect(total).toBe(2)
    for (const ring of rings.get(0) ?? []) expect(ring[0]).toEqual(ring.at(-1))
  })
})

describe("straighten", () => {
  it("removes the corners on a straight line and keeps the ring closed", () => {
    expect(
      straighten([
        [0, 0],
        [1, 0],
        [2, 0],
        [2, 1],
        [0, 1],
        [0, 0],
      ]),
    ).toEqual([
      [0, 0],
      [2, 0],
      [2, 1],
      [0, 1],
      [0, 0],
    ])
  })

  it("removes a straight first corner", () => {
    expect(
      straighten([
        [1, 0],
        [2, 0],
        [2, 1],
        [0, 1],
        [0, 0],
        [1, 0],
      ]),
    ).toEqual([
      [2, 0],
      [2, 1],
      [0, 1],
      [0, 0],
      [2, 0],
    ])
  })
})
