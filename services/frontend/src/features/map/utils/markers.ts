import type { MapTeam } from "@/features/map/api/get-map-teams"
import { type MercatorFit, project } from "@/features/map/utils/projection"
import { teamColor } from "@/features/map/utils/team-color"

/** One rated school with a location, as a marker of the team map. */
export interface MapMarker {
  id: string
  sourceId: string
  name: string
  county: string | null
  division: number | null
  region: number | null
  rank: number
  /** The rating with one decimal, as the page shows it. */
  rating: number
  /** The place of the school, in map units, with one decimal. */
  x: number
  y: number
  /** A team color that shows on a dark and a white page, or null. */
  color: string | null
}

type MarkedTeam = MapTeam & {
  rating: NonNullable<MapTeam["rating"]>
  coordinates: NonNullable<MapTeam["coordinates"]>
}

/**
 * Makes a marker of each rated school with a location. The best school comes last, so the SVG
 * draws it on top of the others. The page sends every marker to the browser, so a marker holds
 * only what the browser cannot work out. The logo and the initials come from the source id and
 * the name.
 */
export function mapMarkers(teams: readonly MapTeam[], fit: MercatorFit): MapMarker[] {
  return (
    teams
      .filter((team): team is MarkedTeam => team.rating !== null && team.coordinates !== null)
      .map((team) => {
        const { x, y } = project(fit, team.coordinates.longitude, team.coordinates.latitude)
        return {
          id: team.id,
          sourceId: team.sourceId,
          name: team.name,
          county: team.county,
          division: team.division,
          region: team.region,
          rank: team.rating.rank,
          rating: tenth(team.rating.value),
          x: tenth(x),
          y: tenth(y),
          color: teamColor(team.primaryColor, team.secondaryColor),
        }
      })
      // A bad location cannot go on the map. It would also spoil the spread of the other markers.
      .filter((marker) => Number.isFinite(marker.x) && Number.isFinite(marker.y))
      .sort((first, second) => second.rank - first.rank)
  )
}

function tenth(value: number) {
  return Math.round(value * 10) / 10
}

/**
 * The color of each county: the team color of its best rated school, as on the map of the home
 * page. A county whose best school has no usable color is left out, so it is gray.
 */
export function countyTints(
  markers: readonly Pick<MapMarker, "county" | "rank" | "color">[],
): Map<string, string> {
  const best = new Map<string, Pick<MapMarker, "rank" | "color">>()
  for (const marker of markers) {
    if (marker.county === null) continue
    const known = best.get(marker.county)
    if (!known || marker.rank < known.rank) best.set(marker.county, marker)
  }
  const tints = new Map<string, string>()
  for (const [county, marker] of best) if (marker.color) tints.set(county, marker.color)
  return tints
}
