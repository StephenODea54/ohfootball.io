import type { Bounds, Point } from "@/features/map/utils/zoom"

/**
 * A grid of square cells of one map unit over a box of the map. Cell (column, row) covers x from
 * x + column to x + column + 1, and y in the same way.
 */
export interface Grid {
  x: number
  y: number
  columns: number
  rows: number
}

/** A grid over a box, with whole map units on its edges and some cells of room on each side. */
export function gridFor([minX, minY, maxX, maxY]: Bounds, room: number): Grid {
  const x = Math.floor(minX) - room
  const y = Math.floor(minY) - room
  return { x, y, columns: Math.ceil(maxX) + room - x, rows: Math.ceil(maxY) + room - y }
}

/** Marks each cell whose middle is inside the rings, by the even-odd rule. */
export function rasterize(rings: readonly Point[][], grid: Grid): Uint8Array {
  const mask = new Uint8Array(grid.columns * grid.rows)
  for (let row = 0; row < grid.rows; row++) {
    const y = grid.y + row + 0.5
    const crossings: number[] = []
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]
        const b = ring[j]
        if (a.y > y !== b.y > y) crossings.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x))
      }
    }
    crossings.sort((a, b) => a - b)
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      // The cells whose middle x + column + 0.5 is from the first crossing to the second.
      const first = Math.max(0, Math.ceil(crossings[k] - grid.x - 0.5))
      const last = Math.min(grid.columns, Math.ceil(crossings[k + 1] - grid.x - 0.5))
      mask.fill(1, row * grid.columns + first, row * grid.columns + Math.max(first, last))
    }
  }
  return mask
}

/** Grows the marked cells by a number of cells in each direction, corners too. */
export function grow(mask: Uint8Array, grid: Grid, cells: number): Uint8Array {
  const { columns, rows } = grid
  const across = new Uint8Array(mask.length)
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (!mask[row * columns + column]) continue
      const from = row * columns + Math.max(0, column - cells)
      across.fill(1, from, row * columns + Math.min(columns, column + cells + 1))
    }
  }
  const grown = new Uint8Array(mask.length)
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (!across[row * columns + column]) continue
      for (
        let other = Math.max(0, row - cells);
        other <= Math.min(rows - 1, row + cells);
        other++
      ) {
        grown[other * columns + column] = 1
      }
    }
  }
  return grown
}

/** A school on the grid with the weight of its seed. */
export interface WeightedPoint extends Point {
  weight: number
}

/**
 * Gives each marked cell to the point with the smallest distance divided by weight, which makes a
 * multiplicatively weighted Voronoi diagram. A cell that is not marked gets -1. On a tie the
 * earlier point wins, so put the best seed first.
 */
export function labelGrid(
  points: readonly WeightedPoint[],
  grid: Grid,
  marked: Uint8Array,
): Int16Array {
  const labels = new Int16Array(grid.columns * grid.rows).fill(-1)
  const scales = points.map((point) => 1 / (point.weight * point.weight))
  for (let row = 0; row < grid.rows; row++) {
    const y = grid.y + row + 0.5
    for (let column = 0; column < grid.columns; column++) {
      const index = row * grid.columns + column
      if (!marked[index]) continue
      const x = grid.x + column + 0.5
      let best = -1
      let bestScore = Number.POSITIVE_INFINITY
      for (let p = 0; p < points.length; p++) {
        const dx = x - points[p].x
        const dy = y - points[p].y
        const score = (dx * dx + dy * dy) * scales[p]
        if (score < bestScore) {
          bestScore = score
          best = p
        }
      }
      labels[index] = best
    }
  }
  return labels
}

/**
 * The distance, in cells, from each cell to the nearest cell with another label or outside the
 * mask, by the 3-4 chamfer rule. The edge of the grid counts as outside. A cell outside the mask
 * has 0.
 */
export function insideDistance(labels: Int16Array, mask: Uint8Array, grid: Grid): Float32Array {
  const { columns, rows } = grid
  const far = 3 * (columns + rows)
  const distance = new Float32Array(labels.length)
  for (let index = 0; index < labels.length; index++) distance[index] = mask[index] ? far : 0
  const step = (index: number, row: number, column: number, cost: number) => {
    if (row < 0 || row >= rows || column < 0 || column >= columns) return cost
    const other = row * columns + column
    return labels[other] === labels[index] ? distance[other] + cost : cost
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column
      if (!distance[index]) continue
      distance[index] = Math.min(
        distance[index],
        step(index, row, column - 1, 3),
        step(index, row - 1, column - 1, 4),
        step(index, row - 1, column, 3),
        step(index, row - 1, column + 1, 4),
      )
    }
  }
  for (let row = rows - 1; row >= 0; row--) {
    for (let column = columns - 1; column >= 0; column--) {
      const index = row * columns + column
      if (!distance[index]) continue
      distance[index] = Math.min(
        distance[index],
        step(index, row, column + 1, 3),
        step(index, row + 1, column + 1, 4),
        step(index, row + 1, column, 3),
        step(index, row + 1, column - 1, 4),
      )
    }
  }
  for (let index = 0; index < distance.length; index++) distance[index] /= 3
  return distance
}
