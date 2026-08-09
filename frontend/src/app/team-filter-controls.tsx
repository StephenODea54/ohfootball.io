"use client"

import { SearchField, SearchInput } from "@/components/ui/search-field"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
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

interface FilterSelectProps {
  onChange: (value: string) => void
  teams: Team[]
  value: string
}

/** Lists only the regions that the loaded teams actually use, so no option is ever empty. */
export function RegionSelect({ onChange, teams, value }: FilterSelectProps) {
  const items = [
    { id: ALL_REGIONS, label: "All Regions" },
    ...[...new Set(teams.flatMap((team) => team.region ?? []))]
      .sort((first, second) => first - second)
      .map((region) => ({ id: region.toString(), label: `Region ${region}` })),
    ...(teams.some((team) => team.region === null)
      ? [{ id: UNASSIGNED_REGION, label: "Unassigned" }]
      : []),
  ]

  return (
    <Select
      aria-label="Filter By Region"
      onChange={(region) => onChange(String(region ?? ALL_REGIONS))}
      value={value}
    >
      <SelectTrigger />
      <SelectContent items={items}>
        {(item) => <SelectItem id={item.id}>{item.label}</SelectItem>}
      </SelectContent>
    </Select>
  )
}

/** Lists only the divisions that the loaded teams actually use. */
export function DivisionSelect({ onChange, teams, value }: FilterSelectProps) {
  const items = [
    { id: ALL_DIVISIONS, label: "All Divisions" },
    ...[...new Set(teams.flatMap((team) => team.division ?? []))]
      .sort((first, second) => first - second)
      .map((division) => ({ id: division.toString(), label: formatDivision(division) })),
    ...(teams.some((team) => team.division === null)
      ? [{ id: INDEPENDENT_DIVISION, label: "Independent" }]
      : []),
  ]

  return (
    <Select
      aria-label="Filter By Division"
      onChange={(division) => onChange(String(division ?? ALL_DIVISIONS))}
      value={value}
    >
      <SelectTrigger />
      <SelectContent items={items}>
        {(item) => <SelectItem id={item.id}>{item.label}</SelectItem>}
      </SelectContent>
    </Select>
  )
}

interface TeamFilterControlsProps {
  filters: TeamFilterState
  onChange: (filters: TeamFilterState) => void
  teams: Team[]
}

export function TeamFilterControls({ filters, onChange, teams }: TeamFilterControlsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_11rem_11rem]">
      <SearchField
        aria-label="Search By School Name"
        value={filters.query}
        onChange={(query) => onChange({ ...filters, query })}
      >
        <SearchInput placeholder="Search by school name…" />
      </SearchField>

      <RegionSelect
        onChange={(region) => onChange({ ...filters, region })}
        teams={teams}
        value={filters.region}
      />

      <DivisionSelect
        onChange={(division) => onChange({ ...filters, division })}
        teams={teams}
        value={filters.division}
      />
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
