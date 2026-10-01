"use client"

import { useMemo, useState } from "react"
import { Heading } from "@/components/ui/heading"
import { Text } from "@/components/ui/text"
import { OutOfStateLegend } from "@/features/teams/components/out-of-state-legend"
import { TeamColorGrid } from "@/features/teams/components/team-color-grid"
import {
  CountySelect,
  DivisionSelect,
  RegionSelect,
} from "@/features/teams/components/team-filter-controls"
import { ALL_COUNTIES, ALL_DIVISIONS, ALL_REGIONS } from "@/features/teams/utils/filter-teams"
import { browseView } from "@/features/teams/utils/team-browse"
import type { TeamSummary } from "@/types/api"

/** How many schools the grid shows before the visitor narrows it by region, division, or county. */
const UNFILTERED_TILES = 24

interface TeamBrowserProps {
  className?: string
  season: number
  teams: TeamSummary[]
}

/** A grid of schools with region, division, and county filters above it. */
export function TeamBrowser({ className, season, teams }: TeamBrowserProps) {
  const [region, setRegion] = useState(ALL_REGIONS)
  const [division, setDivision] = useState(ALL_DIVISIONS)
  const [county, setCounty] = useState(ALL_COUNTIES)

  // The API already sorts by rating, so the top of the list is the top of the state. Showing all
  // seven hundred schools at once is not useful, so the unfiltered grid is capped.
  const view = useMemo(
    () => browseView(teams, { region, division, county }, season, UNFILTERED_TILES),
    [teams, region, division, county, season],
  )

  return (
    <section className={className} aria-labelledby="browse-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Heading id="browse-heading" level={2} className="text-2xl/8">
            {view.heading}
          </Heading>
          <Text className="mt-1 text-sm/6">{view.summary}</Text>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:grid-cols-[11rem_11rem_12rem]">
          <RegionSelect onChange={setRegion} teams={teams} value={region} />
          <DivisionSelect onChange={setDivision} teams={teams} value={division} />
          <CountySelect
            className="col-span-2 sm:col-span-1"
            onChange={setCounty}
            teams={teams}
            value={county}
          />
        </div>
      </div>

      <div className="mt-6">
        <TeamColorGrid label={view.gridLabel} teams={view.tiles} />
        <OutOfStateLegend teams={view.tiles} className="mt-4" />
      </div>
    </section>
  )
}
