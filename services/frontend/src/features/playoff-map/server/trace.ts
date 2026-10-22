import type { Grid } from "@/features/playoff-map/server/raster"

/** A corner of a ring, as [x, y] in map units. */
export type Position = [number, number]

/**
 * Traces the edges of the cells of each label into closed rings, in map units. A ring goes
 * around a group of cells or around a hole in it, and the first corner comes again at the end.
 * Two rings of one label can touch at a corner, where two cells meet only by their corners. The
 * rings of all the labels share their corners exactly, so they leave no gap between them. A cell
 * with a label below 0 belongs to no ring.
 */
export function traceRings(labels: Int16Array, grid: Grid): Map<number, Position[][]> {
  const { columns, rows } = grid
  const width = columns + 1
  const labelAt = (row: number, column: number) =>
    row < 0 || row >= rows || column < 0 || column >= columns ? -1 : labels[row * columns + column]

  // The edges of each label, from the corner where an edge starts to the corners where its edges
  // end. Each cell sends its edges clockwise on the screen, so the cell is on the right of each
  // edge and the edges of a group join end to start.
  const edges = new Map<number, Map<number, number[]>>()
  const add = (label: number, from: number, to: number) => {
    let ofLabel = edges.get(label)
    if (!ofLabel) {
      ofLabel = new Map()
      edges.set(label, ofLabel)
    }
    const ends = ofLabel.get(from)
    if (ends) ends.push(to)
    else ofLabel.set(from, [to])
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const label = labels[row * columns + column]
      if (label < 0) continue
      const topLeft = row * width + column
      const topRight = topLeft + 1
      const bottomLeft = topLeft + width
      const bottomRight = bottomLeft + 1
      if (labelAt(row - 1, column) !== label) add(label, topLeft, topRight)
      if (labelAt(row, column + 1) !== label) add(label, topRight, bottomRight)
      if (labelAt(row + 1, column) !== label) add(label, bottomRight, bottomLeft)
      if (labelAt(row, column - 1) !== label) add(label, bottomLeft, topLeft)
    }
  }

  const position = (corner: number): Position => [
    grid.x + (corner % width),
    grid.y + Math.floor(corner / width),
  ]
  const rings = new Map<number, Position[][]>()
  for (const [label, ofLabel] of edges) {
    const traced: Position[][] = []
    for (const start of ofLabel.keys()) {
      while ((ofLabel.get(start) as number[]).length > 0) {
        const corners = [start]
        let at = start
        do {
          const ends = ofLabel.get(at) as number[]
          at = ends.pop() as number
          corners.push(at)
        } while (at !== start)
        traced.push(straighten(corners.map(position)))
      }
    }
    rings.set(label, traced)
  }
  return rings
}

/**
 * Removes each corner that is on the straight line between the corners next to it. The ring is
 * closed, so its first corner is also its last.
 */
export function straighten(ring: Position[]): Position[] {
  const open = ring.slice(0, -1)
  const kept = open.filter((corner, index) => {
    const before = open[(index + open.length - 1) % open.length]
    const after = open[(index + 1) % open.length]
    return (
      (corner[0] - before[0]) * (after[1] - corner[1]) !==
      (corner[1] - before[1]) * (after[0] - corner[0])
    )
  })
  return [...kept, kept[0]]
}
