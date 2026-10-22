import type { Feature, FeatureCollection, MultiPolygon } from "geojson"
import { feature } from "topojson-client"
import { topology } from "topojson-server"
import { presimplify, simplify } from "topojson-simplify"
import type { Objects, Topology } from "topojson-specification"
import type { Area } from "@/features/map/utils/polygon"
import { polygonPath } from "@/features/map/utils/territories"
import type { Bounds } from "@/features/map/utils/zoom"
import {
  gridFor,
  grow,
  insideDistance,
  labelGrid,
  rasterize,
} from "@/features/playoff-map/server/raster"
import { traceRings } from "@/features/playoff-map/server/trace"
import type { PlayoffMapCell } from "@/features/playoff-map/types"
import { seedWeight } from "@/features/playoff-map/utils/seeds"

/** A playoff school with its seed, placed on the map. */
export interface SeededSchool {
  id: string
  seed: number
  x: number
  y: number
}

/**
 * The cells past the edge of the area that still get an owner. The clip of the area cuts the
 * land at its true edge, so the land must reach a little past it.
 */
const EDGE_ROOM = 2

/**
 * The least area, in square map units, of the triangle of a corner that the simplification keeps.
 * A step of the grid makes a triangle of 0.5, so the steps become straight lines and real bends
 * stay.
 */
const MIN_CORNER_AREA = 2

/**
 * The share of the distance of the grid that the logo circle takes. The 3-4 chamfer distance can
 * be a little too long, and the simplified edge can move inward a little.
 */
const CIRCLE_SHARE = 0.92

/**
 * Splits an area between playoff schools. A point of the area goes to the school with the
 * smallest distance divided by the weight of its seed, so a better seed reaches farther. The
 * build works this out on a grid of one map unit, traces the cells of each school into rings,
 * and simplifies the rings with their shared edges kept shared, so no gap opens between two
 * schools. It runs only in the build.
 *
 * The schools come best seed first. A school with no land in the grid gets no cell.
 */
export function seededTerritories(
  schools: readonly SeededSchool[],
  area: Area,
  bounds: Bounds,
): PlayoffMapCell[] {
  if (schools.length === 0) return []
  const grid = gridFor(bounds, EDGE_ROOM + 1)
  const mask = rasterize(area.rings, grid)
  const labels = labelGrid(
    schools.map((school) => ({ x: school.x, y: school.y, weight: seedWeight(school.seed) })),
    grid,
    grow(mask, grid, EDGE_ROOM),
  )
  const rings = traceRings(labels, grid)

  const shapes: FeatureCollection<MultiPolygon> = {
    type: "FeatureCollection",
    features: schools.map((_, index) => ({
      type: "Feature",
      id: index,
      properties: {},
      geometry: {
        type: "MultiPolygon",
        coordinates: (rings.get(index) ?? []).map((ring) => [ring]),
      },
    })),
  }
  // The shapes have no properties, so the null of GeoJSON properties never comes.
  const shared = simplify(
    presimplify(topology({ shapes }) as Topology<Objects<Record<string, never>>>),
    MIN_CORNER_AREA,
  )
  const simplified = feature(shared, shared.objects.shapes) as FeatureCollection<MultiPolygon>
  const pathOf = new Map(
    simplified.features.map((shape: Feature<MultiPolygon>) => [
      shape.id as number,
      shape.geometry.coordinates
        .map(([ring]) => ring.slice(0, -1))
        // The simplification can fold a small ring into a point or a line, which has no area.
        .filter((ring) => ringArea(ring) !== 0)
        .map((ring) => polygonPath(ring.map(([x, y]) => ({ x, y }))))
        .join(""),
    ]),
  )

  // The land of each school inside the area, and the cell of each school deepest inside its land.
  const distance = insideDistance(labels, mask, grid)
  const land = new Array<number>(schools.length).fill(0)
  const deepest = new Array<number>(schools.length).fill(-1)
  for (let index = 0; index < labels.length; index++) {
    const label = labels[index]
    if (label < 0 || !mask[index]) continue
    land[label]++
    if (deepest[label] < 0 || distance[index] > distance[deepest[label]]) deepest[label] = index
  }

  return schools
    .flatMap((school, index): PlayoffMapCell[] => {
      const path = pathOf.get(index) ?? ""
      if (path === "") return []
      const cell = deepest[index]
      const circle =
        cell < 0
          ? { x: school.x, y: school.y, r: 0 }
          : {
              x: grid.x + (cell % grid.columns) + 0.5,
              y: grid.y + Math.floor(cell / grid.columns) + 0.5,
              r: tenth(Math.max(0, distance[cell] - 0.5) * CIRCLE_SHARE),
            }
      return [{ id: school.id, path, circle, land: land[index] }]
    })
    .sort((first, second) => second.land - first.land)
}

/** The area of a ring by the shoelace formula, with a sign that gives its direction. */
export function ringArea(ring: readonly number[][]) {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  }
  return sum / 2
}

function tenth(value: number) {
  return Math.round(value * 10) / 10
}
