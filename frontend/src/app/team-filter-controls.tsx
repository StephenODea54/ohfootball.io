"use client"

import { SearchField, SearchInput } from "@/components/ui/search-field"
import { formatDivision, type Team } from "@/lib/graphql"
import { CURRENT_SEASON, FIRST_SEASON } from "@/lib/season"

export interface TeamFilterState {
  query: string
  region: string
  division: string
}

interface TeamFilterControlsProps {
  filters: TeamFilterState
  onChange: (filters: TeamFilterState) => void
  onSeasonChange: (season: number) => void
  season: number
  teams: Team[]
}

export function TeamFilterControls({
  filters,
  onChange,
  onSeasonChange,
  season,
  teams,
}: TeamFilterControlsProps) {
  const regions = [...new Set(teams.flatMap((team) => team.region ?? []))].sort((a, b) => a - b)
  const divisions = [...new Set(teams.flatMap((team) => team.division ?? []))].sort((a, b) => a - b)
  const hasUnassignedRegion = teams.some((team) => team.region === null)
  const hasIndependentTeams = teams.some((team) => team.division === null)
  const seasons = Array.from(
    { length: CURRENT_SEASON - FIRST_SEASON + 1 },
    (_, index) => CURRENT_SEASON - index,
  )

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_8rem_10rem_10rem]">
      <SearchField
        aria-label="Search teams"
        value={filters.query}
        onChange={(query) => onChange({ ...filters, query })}
      >
        <SearchInput placeholder="Search school, city, or mascot…" />
      </SearchField>

      <label className="grid gap-1 text-xs/4 font-medium text-muted-fg">
        <span className="sr-only">Season</span>
        <select
          aria-label="Filter by season"
          className="h-10 rounded-lg border bg-bg px-3 text-sm/5 text-fg shadow-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          value={season}
          onChange={(event) => onSeasonChange(Number(event.target.value))}
        >
          {seasons.map((availableSeason) => (
            <option key={availableSeason} value={availableSeason}>{availableSeason}</option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-xs/4 font-medium text-muted-fg">
        <span className="sr-only">Region</span>
        <select
          aria-label="Filter by region"
          className="h-10 rounded-lg border bg-bg px-3 text-sm/5 text-fg shadow-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          value={filters.region}
          onChange={(event) => onChange({ ...filters, region: event.target.value })}
        >
          <option value="">All regions</option>
          {regions.map((region) => (
            <option key={region} value={region}>Region {region}</option>
          ))}
          {hasUnassignedRegion && <option value="unassigned">Unassigned</option>}
        </select>
      </label>

      <label className="grid gap-1 text-xs/4 font-medium text-muted-fg">
        <span className="sr-only">Division</span>
        <select
          aria-label="Filter by division"
          className="h-10 rounded-lg border bg-bg px-3 text-sm/5 text-fg shadow-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          value={filters.division}
          onChange={(event) => onChange({ ...filters, division: event.target.value })}
        >
          <option value="">All divisions</option>
          {divisions.map((division) => (
            <option key={division} value={division}>{formatDivision(division)}</option>
          ))}
          {hasIndependentTeams && <option value="independent">Independent</option>}
        </select>
      </label>
    </div>
  )
}

export function filterTeams(teams: Team[], filters: TeamFilterState) {
  const query = filters.query.trim().toLowerCase()

  return teams.filter((team) => {
    const matchesQuery = !query || [team.name, team.mascot, team.city].some((value) =>
      value?.toLowerCase().includes(query),
    )
    const matchesRegion = !filters.region
      || (filters.region === "unassigned" ? team.region === null : team.region === Number(filters.region))
    const matchesDivision = !filters.division
      || (filters.division === "independent"
        ? team.division === null
        : team.division === Number(filters.division))

    return matchesQuery && matchesRegion && matchesDivision
  })
}
