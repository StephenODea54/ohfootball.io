import type { TeamSummary } from "@/types/api"

export const ALL_REGIONS = "all"
export const UNASSIGNED_REGION = "unassigned"
export const ALL_DIVISIONS = "all"
export const INDEPENDENT_DIVISION = "independent"
export const ALL_COUNTIES = "all"

export interface TeamFilterState {
  query: string
  region: string
  division: string
  county: string
}

export const EMPTY_TEAM_FILTERS: TeamFilterState = {
  query: "",
  region: ALL_REGIONS,
  division: ALL_DIVISIONS,
  county: ALL_COUNTIES,
}

/**
 * Filters teams. The text query matches the school name only, never the city or the mascot. A
 * county filter leaves out every team whose county is not known.
 */
export function filterTeams<T extends TeamSummary>(teams: T[], filters: TeamFilterState) {
  const query = filters.query.trim().toLowerCase()

  return teams.filter((team) => {
    const matchesQuery = !query || team.name.toLowerCase().includes(query)
    const matchesRegion =
      filters.region === ALL_REGIONS ||
      (filters.region === UNASSIGNED_REGION
        ? team.region === null
        : team.region === Number(filters.region))
    const matchesDivision =
      filters.division === ALL_DIVISIONS ||
      (filters.division === INDEPENDENT_DIVISION
        ? team.division === null
        : team.division === Number(filters.division))
    const matchesCounty = filters.county === ALL_COUNTIES || team.county === filters.county

    return matchesQuery && matchesRegion && matchesDivision && matchesCounty
  })
}
