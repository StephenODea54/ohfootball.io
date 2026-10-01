import {
  ALL_COUNTIES,
  ALL_DIVISIONS,
  ALL_REGIONS,
  filterTeams,
} from "@/features/teams/utils/filter-teams"
import type { TeamSummary } from "@/types/api"

interface BrowseFilters {
  region: string
  division: string
  county: string
}

interface BrowseView<T extends TeamSummary> {
  heading: string
  /** The name of the grid for a screen reader. */
  gridLabel: string
  summary: string
  tiles: T[]
}

/**
 * Picks the schools for the grid on the home page and the text above it.
 *
 * With no filter, the grid shows only the best rated schools, up to the limit. The API puts
 * unrated schools last, so they are left out, and a "Top Rated" heading never sits above a school
 * with no rating. Before the first ratings of a season there is nothing to rank, so the grid shows
 * the first schools of the list under a plain heading.
 *
 * A filter shows every match in rating order. Each card keeps the rank of the school across the
 * whole state, and the summary says so, because the first card of a region is not always #1.
 */
export function browseView<T extends TeamSummary>(
  teams: T[],
  filters: BrowseFilters,
  season: number,
  limit: number,
): BrowseView<T> {
  const isFiltered =
    filters.region !== ALL_REGIONS ||
    filters.division !== ALL_DIVISIONS ||
    filters.county !== ALL_COUNTIES

  if (isFiltered) {
    const tiles = filterTeams(teams, { query: "", ...filters })
    return {
      heading: "Matching Schools",
      gridLabel: "Matching Schools",
      summary: `${schools(tiles.length)} in ${season}. Ranks are for the whole state.`,
      tiles,
    }
  }

  const rated = teams.filter((team) => team.rating !== null)
  if (rated.length === 0) {
    return {
      heading: "Schools",
      gridLabel: "Schools",
      summary: `Ratings for ${season} start after the first games. Pick a region, division, or county to see more.`,
      tiles: teams.slice(0, limit),
    }
  }

  const tiles = rated.slice(0, limit)
  // Early in a season fewer schools than the limit have a rating. The grid then holds every rated
  // school, so the summary does not call them the best.
  const shown =
    rated.length <= limit
      ? `${schools(tiles.length)} rated so far`
      : `The ${tiles.length} best rated schools`
  return {
    heading: "Top Rated",
    gridLabel: "Top Rated Schools",
    summary: `${shown} in ${season}. Pick a region, division, or county to see more.`,
    tiles,
  }
}

function schools(count: number) {
  return count === 1 ? "1 school" : `${count.toLocaleString()} schools`
}
