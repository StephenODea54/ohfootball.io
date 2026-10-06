"use client"

import { useRef, useState } from "react"
import { LeaderboardResults } from "@/features/teams/components/leaderboard-results"
import { TeamFilterControls } from "@/features/teams/components/team-filter-controls"
import { EMPTY_TEAM_FILTERS, type TeamFilterState } from "@/features/teams/utils/filter-teams"
import { isBlank, useDebouncedValue } from "@/hooks/use-debounced-value"
import type { TeamSummary } from "@/types/api"

/** Every rated school for a season, ranked, with the filters that narrow the list. */
export function LeaderboardTable({ season, teams }: { season: number; teams: TeamSummary[] }) {
  const [filters, setFilters] = useState<TeamFilterState>(EMPTY_TEAM_FILTERS)
  const [pageIndex, setPageIndex] = useState(0)
  const resultsRef = useRef<HTMLDivElement>(null)
  // The name search applies after a short pause, so the table does not draw again on each key. The
  // selects and a cleared search apply at once.
  const query = useDebouncedValue(filters.query, { applyAtOnce: isBlank })

  // Every change of a filter goes through here, so the list always starts again on page 1.
  function changeFilters(next: TeamFilterState) {
    setFilters(next)
    setPageIndex(0)
  }

  function changePage(next: number) {
    setPageIndex(next)
    // The controls are under the table. When its top has scrolled out of view, bring it back so the
    // new page starts at its first school.
    const top = resultsRef.current
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: "start" })
  }

  return (
    <>
      <div className="mt-8 sm:mt-10">
        <TeamFilterControls filters={filters} onChange={changeFilters} teams={teams} />
      </div>

      <div ref={resultsRef} className="scroll-mt-20">
        <LeaderboardResults
          season={season}
          teams={teams}
          query={query}
          region={filters.region}
          division={filters.division}
          county={filters.county}
          pageIndex={pageIndex}
          onPageIndexChange={changePage}
        />
      </div>
    </>
  )
}
