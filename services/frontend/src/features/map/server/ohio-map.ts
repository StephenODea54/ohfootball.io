import { merge, mesh } from "topojson-client"
import type { MultiPolygon, Polygon } from "topojson-specification"
import {
  type Counties,
  countyName,
  fitOhio,
  ohioCounties,
  readCounties,
} from "@/features/map/server/ohio-projection"
import type { MercatorFit } from "@/features/map/utils/projection"
import { REGIONS, type RegionKey } from "@/features/map/utils/regions"

/** The width of the map in its own units. The height follows from the shape of Ohio. */
export const MAP_WIDTH = 1000

/** The room around the state, in map units, so the thick border of a region is not cut. */
export const MAP_MARGIN = 24

export interface OhioMap {
  width: number
  height: number
  /** The SVG path of the lines between counties. */
  countyBorders: string
  fit: MercatorFit
  /** The shape of each region of REGIONS and the middle of it, in map units. */
  regions: { key: RegionKey; path: string; center: { x: number; y: number } }[]
}

/**
 * Draws the Ohio counties in a Mercator projection that fills the width of the map. It runs only
 * in the build, so d3-geo and the county shapes never reach the browser.
 */
export function ohioMap(topology: Counties = readCounties()): OhioMap {
  const counties = ohioCounties(topology)
  const { path, height, fit } = fitOhio(topology, counties, MAP_WIDTH, MAP_MARGIN)

  // merge needs the list of shapes. Its types also allow the collection, which fails at run time.
  const shapeOf = (names: readonly string[]) =>
    merge(
      topology,
      counties.geometries.filter((county) => names.includes(countyName(county))) as (
        | Polygon
        | MultiPolygon
      )[],
    )

  return {
    width: MAP_WIDTH,
    height,
    countyBorders: path(mesh(topology, counties, (a, b) => a !== b)) ?? "",
    fit,
    regions: REGIONS.map((region) => {
      const shape = shapeOf(region.counties)
      const [centerX, centerY] = path.centroid(shape)
      return {
        key: region.key,
        path: path(shape) ?? "",
        center: { x: centerX, y: centerY },
      }
    }),
  }
}
