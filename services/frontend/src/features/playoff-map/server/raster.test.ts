import { describe, expect, it } from "vitest"
import {
  gridFor,
  grow,
  insideDistance,
  labelGrid,
  rasterize,
} from "@/features/playoff-map/server/raster"

/** The mask as rows of 0 and 1, for a test to read. */
function rows(mask: ArrayLike<number>, columns: number) {
  const lines: string[] = []
  for (let index = 0; index < mask.length; index += columns) {
    lines.push(
      Array.from(mask)
        .slice(index, index + columns)
        .join(""),
    )
  }
  return lines
}

describe("gridFor", () => {
  it("puts the box on whole units with room on each side", () => {
    expect(gridFor([0.4, 1.6, 3.2, 4], 1)).toEqual({ x: -1, y: 0, columns: 6, rows: 5 })
  })
})

describe("rasterize", () => {
  it("marks the cells whose middle is inside, with a hole by the even-odd rule", () => {
    const grid = { x: 0, y: 0, columns: 5, rows: 5 }
    const outer = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 0, y: 5 },
    ]
    const hole = [
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
      { x: 2, y: 3 },
    ]

    expect(rows(rasterize([outer, hole], grid), 5)).toEqual([
      "11111",
      "11111",
      "11011",
      "11111",
      "11111",
    ])
  })

  it("clips a shape that reaches past the grid", () => {
    const grid = { x: 0, y: 0, columns: 3, rows: 2 }
    const wide = [
      { x: -2, y: 0.2 },
      { x: 9, y: 0.2 },
      { x: 9, y: 0.8 },
      { x: -2, y: 0.8 },
    ]

    expect(rows(rasterize([wide], grid), 3)).toEqual(["111", "000"])
  })
})

describe("grow", () => {
  it("grows the marked cells by one cell in each direction, corners too", () => {
    const grid = { x: 0, y: 0, columns: 4, rows: 4 }
    const mask = new Uint8Array(16)
    mask[5] = 1

    expect(rows(grow(mask, grid, 1), 4)).toEqual(["1110", "1110", "1110", "0000"])
  })
})

describe("labelGrid", () => {
  const grid = { x: 0, y: 0, columns: 10, rows: 1 }
  const all = new Uint8Array(10).fill(1)

  it("splits halfway between two points of the same weight, and the first point wins a tie", () => {
    const labels = labelGrid(
      [
        { x: 0, y: 0.5, weight: 1 },
        { x: 10, y: 0.5, weight: 1 },
      ],
      { ...grid, columns: 10 },
      all,
    )
    expect(Array.from(labels).join("")).toBe("0000011111")

    const tie = labelGrid(
      [
        { x: 0.5, y: 0.5, weight: 1 },
        { x: 0.5, y: 0.5, weight: 1 },
      ],
      { x: 0, y: 0, columns: 1, rows: 1 },
      new Uint8Array([1]),
    )
    expect(Array.from(tie)).toEqual([0])
  })

  it("moves the border toward the point with the smaller weight", () => {
    const labels = labelGrid(
      [
        { x: 0, y: 0.5, weight: 1 },
        { x: 10, y: 0.5, weight: 2 },
      ],
      grid,
      all,
    )
    // The border is where d / 1 = (10 - d) / 2, at x = 10 / 3.
    expect(Array.from(labels).join("")).toBe("0001111111")
  })

  it("gives -1 to a cell that is not marked", () => {
    const marked = new Uint8Array(10)
    marked[3] = 1
    const labels = labelGrid([{ x: 0, y: 0, weight: 1 }], grid, marked)
    expect(Array.from(labels)).toEqual([-1, -1, -1, 0, -1, -1, -1, -1, -1, -1])
  })
})

describe("insideDistance", () => {
  it("counts the steps to another label, to the edge of the mask, and to the edge of the grid", () => {
    const grid = { x: 0, y: 0, columns: 7, rows: 3 }
    const labels = new Int16Array(21)
    labels.fill(1, 11, 14)
    const mask = new Uint8Array(21).fill(1)
    mask[13] = 0

    expect(Array.from(insideDistance(labels, mask, grid).slice(7, 14))).toEqual([
      1, 2, 2, 1, 1, 1, 0,
    ])
  })

  it("counts a diagonal step as 4/3", () => {
    const grid = { x: 0, y: 0, columns: 5, rows: 5 }
    const labels = new Int16Array(25)
    const mask = new Uint8Array(25).fill(1)

    expect(insideDistance(labels, mask, grid)[12]).toBe(3)
    const distance = insideDistance(labels, mask, grid)
    expect(distance[6]).toBe(2)
    expect(distance[0]).toBe(1)
  })
})
