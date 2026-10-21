import type { Feature } from "geojson"
import { feature, mesh } from "topojson-client"
import { MAP_MARGIN, MAP_WIDTH } from "@/features/map/server/ohio-map"
import {
  type Counties,
  countyName,
  fitOhio,
  ohioCounties,
  readCounties,
} from "@/features/map/server/ohio-projection"
import type { MercatorFit } from "@/features/map/utils/projection"
import type { Bounds } from "@/features/map/utils/zoom"
import { assignCounties, type RegionMapTeam } from "@/features/playoffs/server/region-map"

/** One county of the map, in map units. */
export interface MapCounty {
  /** The name without the word County, such as Stark. */
  name: string
  path: string
  bounds: Bounds
}

/** The data that the team map sends to the browser. */
export interface CountyMapData {
  width: number
  height: number
  /** The SVG path of the outline of the state. */
  outline: string
  /** The 88 counties, A to Z. */
  counties: MapCounty[]
  /**
   * The region of each county, by division. Each list has the order of counties. A county gets the
   * region of most of its schools of the division, or the region of the nearest county that has
   * one. The OHSAA places schools and not counties, so this is an approximation.
   */
  regions: Record<number, (number | null)[]>
}

export interface CountyMap extends CountyMapData {
  /** Places a school on the map. Only the build needs it, so it does not go to the browser. */
  fit: MercatorFit
}

/**
 * Draws each Ohio county as its own shape, in the same projection as the map of the home page.
 * It runs only in the build, so d3-geo and the county shapes never reach the browser.
 */
export function countyMap(
  teams: readonly RegionMapTeam[],
  topology: Counties = readCounties(),
): CountyMap {
  const counties = ohioCounties(topology)
  const { path, height, fit } = fitOhio(topology, counties, MAP_WIDTH, MAP_MARGIN)
  const shapes = (feature(topology, counties).features as Feature[])
    .map((shape, index) => ({ shape, name: countyName(counties.geometries[index]) }))
    .sort((first, second) => first.name.localeCompare(second.name))
  const names = shapes.map(({ name }) => name)
  const centers = shapes.map(({ shape }) => path.centroid(shape))

  const regions: Record<number, (number | null)[]> = {}
  const divisions = [...new Set(teams.map((team) => team.division))]
    .filter((division): division is number => division !== null)
    .sort((a, b) => a - b)
  for (const division of divisions) {
    regions[division] = assignCounties(
      names,
      centers,
      teams.filter((team) => team.division === division),
    )
  }

  return {
    width: MAP_WIDTH,
    height,
    outline: path(mesh(topology, counties, (a, b) => a === b)) ?? "",
    counties: shapes.map(({ shape, name }) => {
      const [[minX, minY], [maxX, maxY]] = path.bounds(shape)
      return {
        name,
        path: path(shape) ?? "",
        bounds: [tenth(minX), tenth(minY), tenth(maxX), tenth(maxY)],
      }
    }),
    regions,
    fit,
  }
}

function tenth(value: number) {
  return Math.round(value * 10) / 10
}
