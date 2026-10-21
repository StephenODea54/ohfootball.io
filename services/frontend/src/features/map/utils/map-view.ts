import type { CountyMapData } from "@/features/map/server/county-map"
import type { MapMarker } from "@/features/map/utils/markers"
import { pointBounds, unionBounds, type ViewBox, viewBoxFor } from "@/features/map/utils/zoom"
import { divisionLabel, regionLabel } from "@/features/playoffs/utils/format"
import { divisionsOf } from "@/features/playoffs/utils/view"

/** The filters of the team map. They stack: a team must match each filter that is set. */
export interface MapFilters {
  division: number | null
  region: number | null
  county: string | null
}

export const NO_FILTERS: MapFilters = { division: null, region: null, county: null }

/** The divisions in order, each with its regions in order. */
export type DivisionList = { division: number; regions: number[] }[]

/** The divisions and regions that the schools on the map play in. */
export function divisionList(markers: readonly Pick<MapMarker, "division" | "region">[]) {
  const keys = new Map<number, { division: number; region: number }>()
  for (const { division, region } of markers) {
    if (division !== null && region !== null) keys.set(region, { division, region })
  }
  return divisionsOf([...keys.values()])
}

/** The division of a region, or null when no division, or more than one, holds it. */
export function divisionOfRegion(region: number, divisions: DivisionList): number | null {
  const owners = divisions.filter((item) => item.regions.includes(region))
  return owners.length === 1 ? owners[0].division : null
}

/**
 * Reads the filters from the query string of the page, such as ?division=3&region=9&county=Stark.
 * A value that the map does not know is left out. When a name comes more than once, the last
 * value counts. A region alone also sets its division. A region that is not in the division is
 * left out. The county may have any case. A county outside the region clears the region, as a
 * choice of the county on the page does.
 */
export function parseMapFilters(
  search: string,
  divisions: DivisionList,
  map: Pick<CountyMapData, "counties" | "regions">,
  markers: readonly Pick<MapMarker, "county" | "division" | "region">[] = [],
): MapFilters {
  const params = new URLSearchParams(search)
  const last = (name: string) => params.getAll(name).at(-1) ?? null
  const divisionValue = Number(last("division"))
  let division = divisions.some((item) => item.division === divisionValue) ? divisionValue : null
  const regionValue = Number(last("region"))
  const owner = divisionOfRegion(regionValue, divisions)
  let region: number | null = null
  if (owner !== null && (division === null || division === owner)) {
    region = regionValue
    division = owner
  }
  const countyValue = last("county")?.trim().toLowerCase()
  const county = map.counties.find((item) => item.name.toLowerCase() === countyValue)?.name ?? null
  return withCounty({ division, region, county: null }, county, map, markers)
}

export function hasFilters(filters: MapFilters) {
  return filters.division !== null || filters.region !== null || filters.county !== null
}

/** Sets the division. A region of another division no longer applies, so it goes. */
export function withDivision(
  filters: MapFilters,
  division: number | null,
  divisions: DivisionList,
): MapFilters {
  const keepsRegion =
    filters.region !== null &&
    division !== null &&
    divisionOfRegion(filters.region, divisions) === division
  return { ...filters, division, region: keepsRegion ? filters.region : null }
}

/** Sets the region, and with it the division that holds the region. */
export function withRegion(
  filters: MapFilters,
  region: number | null,
  divisions: DivisionList,
): MapFilters {
  if (region === null) return { ...filters, region: null }
  const division = divisionOfRegion(region, divisions)
  return division === null ? filters : { ...filters, division, region }
}

/**
 * Sets the county. When a region is set and the county lies outside it, the region goes, so the
 * choice of a county always shows that county. A county is in the region when the map gives it to
 * the region, or when a school of the region is in the county.
 */
export function withCounty(
  filters: MapFilters,
  county: string | null,
  map: Pick<CountyMapData, "counties" | "regions">,
  markers: readonly Pick<MapMarker, "county" | "division" | "region">[] = [],
): MapFilters {
  if (county === null || filters.region === null || filters.division === null) {
    return { ...filters, county }
  }
  const index = map.counties.findIndex((item) => item.name === county)
  const inRegion =
    map.regions[filters.division]?.[index] === filters.region ||
    markers.some(
      (marker) =>
        marker.county === county &&
        marker.division === filters.division &&
        marker.region === filters.region,
    )
  return { ...filters, county, region: inRegion ? filters.region : null }
}

/** The markers of the schools that match each filter that is set. */
export function matchingMarkers(markers: readonly MapMarker[], filters: MapFilters): MapMarker[] {
  return markers.filter(
    (marker) =>
      (filters.division === null || marker.division === filters.division) &&
      (filters.region === null || marker.region === filters.region) &&
      (filters.county === null || marker.county === filters.county),
  )
}

/**
 * The counties of the chosen area. A county is its own area. Else a region is the counties that
 * the map gives it, and also each county of a school that matches, so each school of the region
 * lies in the area. A division is the whole state, and no filter is no area.
 */
export function selectedCounties(
  filters: MapFilters,
  map: Pick<CountyMapData, "counties" | "regions">,
  matching: readonly Pick<MapMarker, "county">[] = [],
): Set<string> {
  if (filters.county !== null) return new Set([filters.county])
  if (filters.region !== null && filters.division !== null) {
    const regions = map.regions[filters.division] ?? []
    return new Set([
      ...map.counties
        .filter((_, index) => regions[index] === filters.region)
        .map((county) => county.name),
      ...matching.flatMap((marker) => (marker.county === null ? [] : [marker.county])),
    ])
  }
  if (filters.division !== null) return new Set(map.counties.map((county) => county.name))
  return new Set()
}

/**
 * The view that the map zooms to: the chosen counties and the schools that match. A division
 * alone, or no filter, shows the whole state.
 */
export function zoomTarget(
  filters: MapFilters,
  map: Pick<CountyMapData, "counties" | "regions" | "width" | "height">,
  matching: readonly Pick<MapMarker, "x" | "y" | "county">[],
): ViewBox {
  if (filters.county === null && filters.region === null) return viewBoxFor(null, map)
  const chosen = selectedCounties(filters, map, matching)
  const bounds = unionBounds([
    ...map.counties.filter((county) => chosen.has(county.name)).map((county) => county.bounds),
    ...matching.map(pointBounds),
  ])
  return viewBoxFor(bounds, map)
}

/** The choices of the region field. Without a division, each region also names its division. */
export function regionItems(
  divisions: DivisionList,
  division: number | null,
): { id: number; label: string }[] {
  return divisions
    .filter((item) => division === null || item.division === division)
    .flatMap((item) =>
      item.regions.map((region) => ({
        id: region,
        label:
          division === null
            ? `${regionLabel(region)} · ${divisionLabel(item.division)}`
            : regionLabel(region),
      })),
    )
}
