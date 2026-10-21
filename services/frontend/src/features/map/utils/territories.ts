import { Delaunay } from "d3-delaunay"
import {
  type Area,
  centroid,
  distanceToSegment,
  pointInRings,
  polygonSegments,
} from "@/features/map/utils/polygon"
import type { Bounds, Point } from "@/features/map/utils/zoom"

/** A circle in map units. */
export interface Circle {
  x: number
  y: number
  r: number
}

/** The part of the chosen area that is nearer to one school than to any other. */
export interface Territory {
  id: string
  /** The corners of the territory, in map units. */
  polygon: Point[]
  /** The territory as an SVG path, with one decimal. */
  path: string
  /** A large circle inside the territory and inside the area, for the logo and the rank. */
  circle: Circle
}

/** Writes the corners of a polygon as a closed SVG path, with one decimal. */
export function polygonPath(polygon: readonly Point[]): string {
  if (polygon.length === 0) return ""
  const corners = polygon.map((point) => `${tenth(point.x)},${tenth(point.y)}`)
  return `M${corners.join("L")}Z`
}

function tenth(value: number) {
  return Math.round(value * 10) / 10
}

/**
 * A large circle inside a territory and inside the area. It tries each candidate middle that is
 * inside the area and keeps the one with the largest circle. The radius is the distance from that
 * middle to the nearest side of the territory or edge of the area. With no candidate inside the
 * area, the circle has no size and sits at the last candidate.
 */
export function inscribedCircle(
  polygon: readonly Point[],
  candidates: readonly Point[],
  area: Area,
): Circle {
  const sides = [...polygonSegments(polygon), ...area.edges]
  let best: Circle | null = null
  for (const middle of candidates) {
    if (!pointInRings(area.rings, middle)) continue
    const r = Math.min(...sides.map((side) => distanceToSegment(middle, side)))
    if (!best || r > best.r) best = { x: middle.x, y: middle.y, r }
  }
  const last = candidates.at(-1) ?? { x: 0, y: 0 }
  return best ?? { x: last.x, y: last.y, r: 0 }
}

/**
 * Gives each school the part of the box that is nearer to it than to any other school: its
 * Voronoi cell. The map clips the cells to the chosen area. A school on the same spot as another
 * school gets no territory.
 */
export function territories(
  points: readonly (Point & { id: string })[],
  bounds: Bounds,
  area: Area,
): Territory[] {
  if (points.length === 0) return []
  const voronoi = Delaunay.from(
    points,
    (point) => point.x,
    (point) => point.y,
  ).voronoi(bounds)
  return points.flatMap((point, index) => {
    const cell = voronoi.cellPolygon(index)
    if (!cell) return []
    // d3 closes the polygon with a copy of the first corner.
    const polygon = cell.slice(0, -1).map(([x, y]) => ({ x, y }))
    const middle = centroid(polygon)
    // The middle, the points halfway to the school and to each corner, and the school itself.
    const candidates = [
      middle,
      ...[point, ...polygon].map((corner) => ({
        x: (middle.x + corner.x) / 2,
        y: (middle.y + corner.y) / 2,
      })),
      { x: point.x, y: point.y },
    ]
    return [
      {
        id: point.id,
        polygon,
        path: polygonPath(polygon),
        circle: inscribedCircle(polygon, candidates, area),
      },
    ]
  })
}
