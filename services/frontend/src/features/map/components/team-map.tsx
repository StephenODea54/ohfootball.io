"use client"

import { useEffect, useMemo, useState } from "react"
import { twJoin } from "tailwind-merge"
import { Heading } from "@/components/ui/heading"
import { Note } from "@/components/ui/note"
import { Text } from "@/components/ui/text"
import { paths } from "@/config/paths"
import { MapCanvas } from "@/features/map/components/map-canvas"
import { MapFilterBar } from "@/features/map/components/map-filters"
import { TeamList } from "@/features/map/components/team-list"
import type { CountyMapData } from "@/features/map/server/county-map"
import {
  divisionList,
  hasFilters,
  type MapFilters,
  matchingMarkers,
  NO_FILTERS,
  parseMapFilters,
  selectedCounties,
  withCounty,
  withDivision,
  withRegion,
  zoomTarget,
} from "@/features/map/utils/map-view"
import { countyTints, type MapMarker } from "@/features/map/utils/markers"
import { divisionLabel, regionLabel } from "@/features/playoffs/utils/format"

interface TeamMapProps {
  map: CountyMapData
  /** Every rated school with a location, best rated last. */
  markers: MapMarker[]
}

/** The names of the query string that the map owns. The page keeps any other name. */
const FILTER_NAMES = ["division", "region", "county"]

/**
 * The address of the page with these filters. It changes only the names of the filters, and it
 * keeps the rest of the query string and the part after #.
 */
function addressWith(filters: MapFilters) {
  const url = new URL(window.location.href)
  const own = new URLSearchParams(paths.map.getHref(filters).split("?")[1] ?? "")
  for (const name of FILTER_NAMES) url.searchParams.delete(name)
  for (const [name, value] of own) url.searchParams.set(name, value)
  return url.pathname + url.search + url.hash
}

/** Writes the address. It replaces the entry of the history, so Back leaves the page. */
function writeAddress(href: string) {
  window.history.replaceState(null, "", href)
}

/** The filters in words, such as Division III, Region 9, Stark County. */
function filterSummary(filters: MapFilters) {
  return [
    filters.division === null ? null : divisionLabel(filters.division),
    filters.region === null ? null : regionLabel(filters.region),
    filters.county === null ? null : `${filters.county} County`,
  ]
    .filter(Boolean)
    .join(", ")
}

/**
 * The map of the teams. With no filter it shows only the counties. A filter shows each school
 * that matches as a marker and zooms the map to the chosen area. The filters live in the query
 * string, so a link opens the same map. Each change replaces the entry of the history, so Back
 * leaves the page.
 */
export function TeamMap({ map, markers }: TeamMapProps) {
  const divisions = useMemo(() => divisionList(markers), [markers])
  const countyNames = useMemo(() => map.counties.map((county) => county.name), [map])
  const tints = useMemo(() => countyTints(markers), [markers])
  // The page is drawn ahead of time without a query string, so it starts with no filter.
  const [filters, setFilters] = useState<MapFilters>(NO_FILTERS)
  // The hint waits until the page has read the address, so a link with filters does not show it
  // for a moment.
  const [ready, setReady] = useState(false)

  // Only the browser knows the address, so the filters are read after the first draw. An address
  // with a value that the map does not know is written again with the filters that it kept.
  useEffect(() => {
    const parsed = parseMapFilters(window.location.search, divisions, map, markers)
    setFilters(parsed)
    setReady(true)
    const href = addressWith(parsed)
    const { pathname, search, hash } = window.location
    if (href !== pathname + search + hash) writeAddress(href)
  }, [divisions, map, markers])

  const choose = (next: MapFilters) => {
    setFilters(next)
    writeAddress(addressWith(next))
  }

  const filtered = hasFilters(filters)
  // With no filter the map shows only the counties.
  const matching = useMemo(
    () => (filtered ? matchingMarkers(markers, filters) : []),
    [markers, filters, filtered],
  )
  const selected = useMemo(() => selectedCounties(filters, map, matching), [filters, map, matching])
  const target = useMemo(() => zoomTarget(filters, map, matching), [filters, map, matching])
  const summary = filterSummary(filters)
  const count = matching.length

  return (
    <div className="mt-8">
      <MapFilterBar
        filters={filters}
        divisions={divisions}
        counties={countyNames}
        onDivisionChange={(division) => choose(withDivision(filters, division, divisions))}
        onRegionChange={(region) => choose(withRegion(filters, region, divisions))}
        onCountyChange={(county) => choose(withCounty(filters, county, map, markers))}
        onClear={() => choose(NO_FILTERS)}
      />

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="overflow-hidden rounded-2xl border bg-muted/30 p-2 sm:p-3">
          <MapCanvas
            map={map}
            tints={tints}
            selected={selected}
            filtered={filtered}
            markers={matching}
            markersKey={paths.map.getHref(filters)}
            target={target}
            onSelectCounty={(county) =>
              choose(withCounty(filters, filters.county === county ? null : county, map, markers))
            }
          />
        </div>

        {/* On a narrow screen the hint comes before the map, so it is the first thing to read. */}
        <section
          aria-labelledby={filtered ? "map-teams-heading" : undefined}
          className={twJoin("min-w-0", !filtered && "max-lg:order-first")}
        >
          {ready && !filtered && (
            <Note intent="info">
              Choose a division, a region, or a county to show its teams. You can also select a
              county on the map.
            </Note>
          )}
          {filtered && (
            <>
              <Heading id="map-teams-heading" level={2} className="text-xl/8">
                {count === 1 ? "1 rated school" : `${count} rated schools`}
              </Heading>
              <Text className="mb-4 text-sm/6">{summary}. Ranks are for the whole state.</Text>
              {count === 0 ? (
                <Note intent="warning">
                  No rated school matches these filters. Clear a filter to see more schools.
                </Note>
              ) : (
                <TeamList label={`Rated schools: ${summary}`} markers={matching} />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
