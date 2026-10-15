import { geoArea, geoMercator, geoPath } from "d3-geo"
import type {
  Feature,
  FeatureCollection,
  MultiPolygon as GeoMultiPolygon,
  Polygon as GeoPolygon,
} from "geojson"
import { feature, merge, mesh } from "topojson-client"
import type { GeometryCollection, MultiPolygon, Polygon, Topology } from "topojson-specification"
import { readCounties } from "@/features/map/server/ohio-map"

/** The width of the map in its own units. The height follows from the shape of Ohio. */
const MAP_WIDTH = 400
const MAP_MARGIN = 8
const OHIO_FIPS = "39"

/** A school of the season with the county, the division and the region that it plays in. */
export interface RegionMapTeam {
  county: string | null
  division: number | null
  region: number | null
}

export interface RegionShape {
  region: number
  path: string
  /** The middle of the shape, in map units, for its label. */
  label: { x: number; y: number }
}

export interface PlayoffMap {
  width: number
  height: number
  /** The SVG path of the outline of the state. */
  outline: string
  /** The four regions of each division, by division. */
  divisions: Record<number, RegionShape[]>
}

type Counties = Topology<{ counties: GeometryCollection<{ name: string }> }>

/**
 * Draws the regions of each division as groups of whole counties. It runs only in the build.
 *
 * The OHSAA places schools in regions, not counties, so the map is an approximation. A county
 * goes to the region that most of its schools of the division play in. A county without a school
 * of the division goes to the region of the nearest county that has one.
 */
export function playoffMap(
  teams: readonly RegionMapTeam[],
  topology: Counties = readCounties(),
): PlayoffMap {
  const counties: GeometryCollection<{ name: string }> = {
    type: "GeometryCollection",
    geometries: topology.objects.counties.geometries.filter((county) =>
      String(county.id).startsWith(OHIO_FIPS),
    ),
  }
  const shapes = feature(topology, counties) as FeatureCollection
  const projection = geoMercator().fitWidth(MAP_WIDTH - 2 * MAP_MARGIN, shapes)
  const [x, y] = projection.translate()
  projection.translate([x + MAP_MARGIN, y + MAP_MARGIN])
  const path = geoPath(projection).digits(1)
  const [, [, bottom]] = path.bounds(shapes)
  const names = counties.geometries.map(
    (county) => (county.properties as { name?: string } | undefined)?.name ?? "",
  )
  const centers = (shapes.features as Feature[]).map((shape) => path.centroid(shape))

  const divisions: Record<number, RegionShape[]> = {}
  const divisionNumbers = [...new Set(teams.map((team) => team.division))].filter(
    (division): division is number => division !== null,
  )
  for (const division of divisionNumbers.sort((a, b) => a - b)) {
    const assigned = assignCounties(
      names,
      centers,
      teams.filter((team) => team.division === division),
    )
    divisions[division] = [...new Set(assigned.filter((region) => region !== null))]
      .sort((a, b) => (a ?? 0) - (b ?? 0))
      .map((region) => {
        const shape = merge(
          topology,
          counties.geometries.filter((_, index) => assigned[index] === region) as (
            | Polygon
            | MultiPolygon
          )[],
        )
        const [labelX, labelY] = path.centroid(largestPart(shape))
        return {
          region: region as number,
          path: path(shape) ?? "",
          label: { x: Math.round(labelX), y: Math.round(labelY) },
        }
      })
  }

  return {
    width: MAP_WIDTH,
    height: Math.ceil(bottom + MAP_MARGIN),
    outline: path(mesh(topology, counties, (a, b) => a === b)) ?? "",
    divisions,
  }
}

/**
 * Gives the region of each county: the region of most of its schools, or the region of the
 * nearest county that has a school. A tie goes to the lower region.
 */
export function assignCounties(
  names: readonly string[],
  centers: readonly [number, number][],
  teams: readonly RegionMapTeam[],
): (number | null)[] {
  const counts = new Map<string, Map<number, number>>()
  for (const team of teams) {
    if (team.county === null || team.region === null) continue
    const regions = counts.get(team.county) ?? new Map<number, number>()
    regions.set(team.region, (regions.get(team.region) ?? 0) + 1)
    counts.set(team.county, regions)
  }
  const own = names.map((name) => {
    const regions = counts.get(name)
    if (!regions) return null
    return [...regions.entries()].sort(([a, first], [b, second]) => second - first || a - b)[0][0]
  })
  return own.map((region, index) => {
    if (region !== null) return region
    let best: number | null = null
    let distance = Number.POSITIVE_INFINITY
    own.forEach((other, otherIndex) => {
      if (other === null) return
      const gap = Math.hypot(
        centers[index][0] - centers[otherIndex][0],
        centers[index][1] - centers[otherIndex][1],
      )
      if (gap < distance) {
        distance = gap
        best = other
      }
    })
    return best
  })
}

/**
 * Gives the largest polygon of a shape. A region can be one county apart from the rest, and the
 * middle of the whole shape can then fall on a border, so the label goes in the largest part.
 */
function largestPart(shape: GeoMultiPolygon): GeoMultiPolygon | GeoPolygon {
  if (shape.coordinates.length < 2) return shape
  const parts = shape.coordinates.map(
    (coordinates): GeoPolygon => ({ type: "Polygon", coordinates }),
  )
  return parts.reduce((largest, part) => (geoArea(part) > geoArea(largest) ? part : largest))
}
