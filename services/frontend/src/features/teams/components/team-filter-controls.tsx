"use client"

import { SearchField, SearchInput } from "@/components/ui/search-field"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import {
  ALL_COUNTIES,
  ALL_DIVISIONS,
  ALL_REGIONS,
  INDEPENDENT_DIVISION,
  type TeamFilterState,
  UNASSIGNED_REGION,
} from "@/features/teams/utils/filter-teams"
import { formatDivision } from "@/features/teams/utils/format"
import type { TeamSummary } from "@/types/api"

interface FilterSelectProps {
  className?: string
  onChange: (value: string) => void
  teams: TeamSummary[]
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

/** The options of the county Select: All Counties, then each county of the teams once, A to Z. */
export function countyItems(teams: Pick<TeamSummary, "county">[]) {
  return [
    { id: ALL_COUNTIES, label: "All Counties" },
    ...[...new Set(teams.flatMap((team) => team.county ?? []))]
      .sort((first, second) => first.localeCompare(second))
      .map((county) => ({ id: county, label: `${county} County` })),
  ]
}

/**
 * Lists only the counties that the loaded teams actually use. The Select jumps to a county when
 * the visitor types its first letters.
 */
export function CountySelect({ className, onChange, teams, value }: FilterSelectProps) {
  const items = countyItems(teams)

  return (
    <Select
      aria-label="Filter By County"
      className={className}
      onChange={(county) => onChange(String(county ?? ALL_COUNTIES))}
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
  teams: TeamSummary[]
}

export function TeamFilterControls({ filters, onChange, teams }: TeamFilterControlsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_11rem_11rem_12rem]">
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

      <CountySelect
        onChange={(county) => onChange({ ...filters, county })}
        teams={teams}
        value={filters.county}
      />
    </div>
  )
}
