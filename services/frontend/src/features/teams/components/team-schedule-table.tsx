"use client"

import { PUBLIC_PICKEM } from "astro:env/client"
import { lazy, Suspense } from "react"
import { ScheduleTable, type ScheduleTeam } from "@/features/teams/components/schedule-table"

export type { ScheduleGame } from "@/features/teams/components/schedule-table"

/**
 * The schedule with its pick controls. It is a separate script, and the browser loads it only for
 * a schedule with a game that takes picks. When Pick 'Em is off, the build leaves it out.
 */
const ScheduleWithPicks = PUBLIC_PICKEM
  ? lazy(() =>
      import("@/features/pickem/components/schedule-with-picks").then((module) => ({
        default: module.ScheduleWithPicks,
      })),
    )
  : null

/**
 * The schedule of a team. When Pick 'Em is on, a game that takes picks gets a line under its row
 * with the pick control. The board of picks loads when the first such game comes into view.
 */
export function TeamScheduleTable({ team }: { team: ScheduleTeam }) {
  if (!PUBLIC_PICKEM || !ScheduleWithPicks || !team.schedule.some((game) => game.pick)) {
    return <ScheduleTable team={team} />
  }
  return (
    // The build draws the whole schedule with its picks, so the fallback shows only until the
    // script of the picks loads in a browser that drew nothing yet.
    <Suspense fallback={<ScheduleTable team={team} />}>
      <ScheduleWithPicks team={team} />
    </Suspense>
  )
}
