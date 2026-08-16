"use client"

import { useMemo, useState } from "react"
import { Heading } from "@/components/ui/heading"
import { Text } from "@/components/ui/text"
import { TeamColorGrid } from "@/features/teams/components/team-color-grid"
import {
  DivisionSelect,
  RegionSelect,
} from "@/features/teams/components/team-filter-controls"
import {
  ALL_DIVISIONS,
  ALL_REGIONS,
  filterTeams,
} from "@/features/teams/utils/filter-teams"
import type { Team } from "@/types/api"

/** How many schools the grid shows before the visitor narrows it by region or division. */
const UNFILTERED_TILES = 24

interface TeamBrowserProps {
  className?: string
  onSelectTeam: (teamId: string) => void
  season: number | undefined
  teams: Team[]
}

/** A grid of schools with region and division filters above it. */
export function TeamBrowser({ className, onSelectTeam, season, teams }: TeamBrowserProps) {
  const [region, setRegion] = useState(ALL_REGIONS)
  const [division, setDivision] = useState(ALL_DIVISIONS)

  const isFiltered = region !== ALL_REGIONS || division !== ALL_DIVISIONS

  // The API already sorts by rating, so the top of the list is the top of the state. Showing all
  // seven hundred schools at once is not useful, so the unfiltered grid is capped.
  const tiles = useMemo(() => {
    const matching = filterTeams(teams, { query: "", region, division })
    return isFiltered ? matching : matching.slice(0, UNFILTERED_TILES)
  }, [teams, region, division, isFiltered])

  return (
    <section className={className} aria-labelledby="browse-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Heading id="browse-heading" level={2} className="text-2xl/8">
            {isFiltered ? "Matching Schools" : "Top Rated"}
          </Heading>
          <Text className="mt-1 text-sm/6">
            {isFiltered
              ? `${tiles.length.toLocaleString()} schools${season ? ` in ${season}` : ""}.`
              : `The ${UNFILTERED_TILES} best schools${season ? ` in ${season}` : ""}. Pick a region or division to see more.`}
          </Text>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:grid-cols-[11rem_11rem]">
          <RegionSelect onChange={setRegion} teams={teams} value={region} />
          <DivisionSelect onChange={setDivision} teams={teams} value={division} />
        </div>
      </div>

      <div className="mt-6">
        <TeamColorGrid
          label={isFiltered ? "Matching Schools" : "Top Rated Schools"}
          onSelectTeam={onSelectTeam}
          teams={tiles}
        />
      </div>
    </section>
  )
}
