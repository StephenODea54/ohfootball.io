import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { geoMercator, geoPath } from "d3-geo"
import type { FeatureCollection } from "geojson"
import { feature, merge, mesh } from "topojson-client"
import type { GeometryCollection, MultiPolygon, Polygon, Topology } from "topojson-specification"
import type { MercatorFit } from "@/features/map/utils/projection"
import { REGIONS, type RegionKey } from "@/features/map/utils/regions"

/** The width of the map in its own units. The height follows from the shape of Ohio. */
export const MAP_WIDTH = 1000

/** The room around the state, in map units, so the thick border of a region is not cut. */
const MAP_MARGIN = 24

/** The first two digits of the FIPS code of every Ohio county. */
const OHIO_FIPS = "39"

export interface OhioMap {
  width: number
  height: number
  /** The SVG path of the lines between counties. */
  countyBorders: string
  fit: MercatorFit
  /** The shape of each region of REGIONS and the middle of it, in map units. */
  regions: { key: RegionKey; path: string; center: { x: number; y: number } }[]
}

type Counties = Topology<{ counties: GeometryCollection<{ name: string }> }>

/**
 * Reads the county shapes of us-atlas. The file is read from disk, not imported, so the build
 * never sends it to the browser and the type checker does not read 800 kB of JSON.
 */
export function readCounties(): Counties {
  const path = createRequire(import.meta.url).resolve("us-atlas/counties-10m.json")
  return JSON.parse(readFileSync(path, "utf8")) as Counties
}

/**
 * Draws the Ohio counties in a Mercator projection that fills the width of the map. It runs only
 * in the build, so d3-geo and the county shapes never reach the browser.
 */
export function ohioMap(topology: Counties = readCounties()): OhioMap {
  const counties: GeometryCollection<{ name: string }> = {
    type: "GeometryCollection",
    geometries: topology.objects.counties.geometries.filter((county) =>
      String(county.id).startsWith(OHIO_FIPS),
    ),
  }
  const shapes = feature(topology, counties) as FeatureCollection
  const projection = geoMercator().fitWidth(MAP_WIDTH - 2 * MAP_MARGIN, shapes)
  projection.translate([
    projection.translate()[0] + MAP_MARGIN,
    projection.translate()[1] + MAP_MARGIN,
  ])
  const path = geoPath(projection).digits(1)
  const [, [, bottom]] = path.bounds(shapes)
  const scale = projection.scale()
  const [x, y] = projection.translate()

  // merge needs the list of shapes. Its types also allow the collection, which fails at run time.
  const shapeOf = (names: readonly string[]) =>
    merge(
      topology,
      counties.geometries.filter((county) =>
        names.includes((county.properties as { name?: string } | undefined)?.name ?? ""),
      ) as (Polygon | MultiPolygon)[],
    )

  return {
    width: MAP_WIDTH,
    height: Math.ceil(bottom + MAP_MARGIN),
    countyBorders: path(mesh(topology, counties, (a, b) => a !== b)) ?? "",
    // d3 places a point at scale × λ + x. In the Web Mercator unit square the same point is
    // 2π × scale × mx − π × scale + x, so the fit holds only these three numbers.
    fit: { scale: 2 * Math.PI * scale, x: x - Math.PI * scale, y: y - Math.PI * scale },
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
