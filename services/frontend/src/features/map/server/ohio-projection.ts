import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { type GeoPath, geoMercator, geoPath } from "d3-geo"
import type { FeatureCollection } from "geojson"
import { feature } from "topojson-client"
import type { GeometryCollection, Topology } from "topojson-specification"
import type { MercatorFit } from "@/features/map/utils/projection"

/** The first two digits of the FIPS code of every Ohio county. */
export const OHIO_FIPS = "39"

export type Counties = Topology<{ counties: GeometryCollection<{ name: string }> }>

/**
 * Reads the county shapes of us-atlas. The file is read from disk, not imported, so the build
 * never sends it to the browser and the type checker does not read 800 kB of JSON.
 */
export function readCounties(): Counties {
  const path = createRequire(import.meta.url).resolve("us-atlas/counties-10m.json")
  return JSON.parse(readFileSync(path, "utf8")) as Counties
}

/** The 88 Ohio counties of the topology, in the order of the file. */
export function ohioCounties(topology: Counties): GeometryCollection<{ name: string }> {
  return {
    type: "GeometryCollection",
    geometries: topology.objects.counties.geometries.filter((county) =>
      String(county.id).startsWith(OHIO_FIPS),
    ),
  }
}

/** The name of a county of the topology, such as Stark. */
export function countyName(county: { properties?: { name?: string } | null }): string {
  return county.properties?.name ?? ""
}

export interface OhioFit {
  /** Draws a shape as an SVG path with one decimal at most. */
  path: GeoPath
  /** The height of the map, in map units. */
  height: number
  /** The same projection as three numbers, so the browser can place a school without d3. */
  fit: MercatorFit
}

/**
 * Fits Ohio in a Mercator projection that fills the width of the map, with a margin on each side.
 * It runs only in the build, so d3-geo never reaches the browser.
 */
export function fitOhio(
  topology: Counties,
  counties: GeometryCollection<{ name: string }>,
  width: number,
  margin: number,
): OhioFit {
  const shapes = feature(topology, counties) as FeatureCollection
  const projection = geoMercator().fitWidth(width - 2 * margin, shapes)
  const [x, y] = projection.translate()
  projection.translate([x + margin, y + margin])
  const path = geoPath(projection).digits(1)
  const [, [, bottom]] = path.bounds(shapes)
  const scale = projection.scale()
  const [left, top] = projection.translate()
  return {
    path,
    height: Math.ceil(bottom + margin),
    // d3 places a point at scale × λ + x. In the Web Mercator unit square the same point is
    // 2π × scale × mx − π × scale + x, so the fit holds only these three numbers.
    fit: { scale: 2 * Math.PI * scale, x: left - Math.PI * scale, y: top - Math.PI * scale },
  }
}
