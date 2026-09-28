"use client"

import { TeamBrowser } from "@/features/teams/components/team-browser"
import { TeamSearch } from "@/features/teams/components/team-search"
import type { TeamSummary } from "@/types/api"

interface TeamFinderProps {
  season: number
  teams: TeamSummary[]
}

/**
 * The name search and the grid of schools on the home page. They are one island, so the page
 * sends the list of teams to the browser one time and not two.
 */
export function TeamFinder({ season, teams }: TeamFinderProps) {
  return (
    <>
      <div className="mt-8 max-w-2xl">
        <TeamSearch teams={teams} />
      </div>

      <TeamBrowser className="mt-12" season={season} teams={teams} />
    </>
  )
}
