"use client"

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { SearchField, SearchInput } from "@/components/ui/search-field"
import { formatDivision, type Team } from "@/lib/graphql"

export const ALL_REGIONS = "all"
export const UNASSIGNED_REGION = "unassigned"
export const ALL_DIVISIONS = "all"
export const INDEPENDENT_DIVISION = "independent"

export interface TeamFilterState {
  query: string
  region: string
  division: string
}

export const EMPTY_TEAM_FILTERS: TeamFilterState = {
  query: "",
  region: ALL_REGIONS,
  division: ALL_DIVISIONS,
}

interface TeamFilterControlsProps {
  filters: TeamFilterState
  onChange: (filters: TeamFilterState) => void
  teams: Team[]
}

export function TeamFilterControls({ filters, onChange, teams }: TeamFilterControlsProps) {
  const regionItems = [
    { id: ALL_REGIONS, label: "All regions" },
    ...[...new Set(teams.flatMap((team) => team.region ?? []))]
      .sort((a, b) => a - b)
      .map((region) => ({ id: region.toString(), label: `Region ${region}` })),
    ...(teams.some((team) => team.region === null)
      ? [{ id: UNASSIGNED_REGION, label: "Unassigned" }]
      : []),
  ]

  const divisionItems = [
    { id: ALL_DIVISIONS, label: "All divisions" },
    ...[...new Set(teams.flatMap((team) => team.division ?? []))]
      .sort((a, b) => a - b)
      .map((division) => ({ id: division.toString(), label: formatDivision(division) })),
    ...(teams.some((team) => team.division === null)
      ? [{ id: INDEPENDENT_DIVISION, label: "Independent" }]
      : []),
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_11rem_11rem]">
      <SearchField
        aria-label="Search by school name"
        value={filters.query}
        onChange={(query) => onChange({ ...filters, query })}
      >
        <SearchInput placeholder="Search by school name…" />
      </SearchField>

      <Select
        aria-label="Filter by region"
        onChange={(region) => onChange({ ...filters, region: String(region ?? ALL_REGIONS) })}
        value={filters.region}
      >
        <SelectTrigger />
        <SelectContent items={regionItems}>
          {(item) => <SelectItem id={item.id}>{item.label}</SelectItem>}
        </SelectContent>
      </Select>

      <Select
        aria-label="Filter by division"
        onChange={(division) =>
          onChange({ ...filters, division: String(division ?? ALL_DIVISIONS) })
        }
        value={filters.division}
      >
        <SelectTrigger />
        <SelectContent items={divisionItems}>
          {(item) => <SelectItem id={item.id}>{item.label}</SelectItem>}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Filters teams. The text query matches the school name only, never the city or the mascot. */
export function filterTeams(teams: Team[], filters: TeamFilterState) {
  const query = filters.query.trim().toLowerCase()

  return teams.filter((team) => {
    const matchesQuery = !query || team.name.toLowerCase().includes(query)
    const matchesRegion = filters.region === ALL_REGIONS
      || (filters.region === UNASSIGNED_REGION
        ? team.region === null
        : team.region === Number(filters.region))
    const matchesDivision = filters.division === ALL_DIVISIONS
      || (filters.division === INDEPENDENT_DIVISION
        ? team.division === null
        : team.division === Number(filters.division))

    return matchesQuery && matchesRegion && matchesDivision
  })
}
