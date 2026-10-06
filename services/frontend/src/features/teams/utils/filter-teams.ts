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

/** Tells if the school name holds the query. Case and spaces at the ends do not matter. */
export function matchesQuery(team: Pick<TeamSummary, "name">, query: string) {
  const text = query.trim().toLowerCase()
  return !text || team.name.toLowerCase().includes(text)
}

export function matchesRegion(team: Pick<TeamSummary, "region">, region: string) {
  if (region === ALL_REGIONS) return true
  return region === UNASSIGNED_REGION ? team.region === null : team.region === Number(region)
}

export function matchesDivision(team: Pick<TeamSummary, "division">, division: string) {
  if (division === ALL_DIVISIONS) return true
  return division === INDEPENDENT_DIVISION
    ? team.division === null
    : team.division === Number(division)
}

/** A county filter leaves out every team whose county is not known. */
export function matchesCounty(team: Pick<TeamSummary, "county">, county: string) {
  return county === ALL_COUNTIES || team.county === county
}

/**
 * Filters teams. The text query matches the school name only, never the city or the mascot. A
 * county filter leaves out every team whose county is not known.
 */
export function filterTeams<T extends TeamSummary>(teams: T[], filters: TeamFilterState) {
  return teams.filter(
    (team) =>
      matchesQuery(team, filters.query) &&
      matchesRegion(team, filters.region) &&
      matchesDivision(team, filters.division) &&
      matchesCounty(team, filters.county),
  )
}
