import type { Point } from "@/features/map/utils/zoom"

/** A line from one point to another. */
export type Segment = [Point, Point]

/**
 * The rings of an SVG path that holds only absolute M, L, and Z commands, as d3-geo writes them.
 * Each ring is a list of its corners.
 */
export function pathRings(d: string): Point[][] {
  const rings: Point[][] = []
  for (const [, command, numbers] of d.matchAll(/([MLZ])([^MLZ]*)/g)) {
    if (command === "Z") continue
    const [x, y] = numbers.split(",").map(Number)
    if (command === "M") rings.push([])
    rings.at(-1)?.push({ x, y })
  }
  return rings.filter((ring) => ring.length > 0)
}

/**
 * Tells if a point is inside the rings, by the even-odd rule. A ring inside another ring is a
 * hole, such as a county that another county surrounds.
 */
export function pointInRings(rings: readonly Point[][], point: Point): boolean {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]
      const b = ring[j]
      if (a.y > point.y !== b.y > point.y) {
        const crossX = a.x + ((point.y - a.y) / (b.y - a.y)) * (b.x - a.x)
        if (point.x < crossX) inside = !inside
      }
    }
  }
  return inside
}

/** The middle of the area of a polygon. A polygon with no area gives the mean of its corners. */
export function centroid(polygon: readonly Point[]): Point {
  let area = 0
  let x = 0
  let y = 0
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]
    const b = polygon[i]
    const cross = a.x * b.y - b.x * a.y
    area += cross
    x += (a.x + b.x) * cross
    y += (a.y + b.y) * cross
  }
  if (Math.abs(area) < 1e-9) {
    const count = Math.max(1, polygon.length)
    return {
      x: polygon.reduce((sum, point) => sum + point.x, 0) / count,
      y: polygon.reduce((sum, point) => sum + point.y, 0) / count,
    }
  }
  return { x: x / (3 * area), y: y / (3 * area) }
}

/** The shortest distance from a point to a line from a to b. */
export function distanceToSegment(point: Point, [a, b]: Segment): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

/** The sides of a polygon, with the last corner joined to the first. */
export function polygonSegments(polygon: readonly Point[]): Segment[] {
  return polygon.map((point, index) => [point, polygon[(index + 1) % polygon.length]])
}

/** The chosen counties as one area: the rings of each county, and the edge of the whole area. */
export interface Area {
  rings: Point[][]
  /** Only the outer edge. A border between two chosen counties is not part of it. */
  edges: Segment[]
}

/**
 * Joins the shapes of counties into one area. Two counties draw their shared border with the same
 * points, so a side that comes twice is inside the area and is not part of its edge.
 */
export function areaShape(paths: readonly string[]): Area {
  const rings = paths.flatMap(pathRings)
  const sides = new Map<string, { segment: Segment; count: number }>()
  for (const ring of rings) {
    for (const segment of polygonSegments(ring)) {
      const ends = segment.map((point) => `${point.x},${point.y}`).sort()
      if (ends[0] === ends[1]) continue
      const key = ends.join(" ")
      const side = sides.get(key)
      if (side) side.count++
      else sides.set(key, { segment, count: 1 })
    }
  }
  return {
    rings,
    edges: [...sides.values()].filter((side) => side.count === 1).map((side) => side.segment),
  }
}
