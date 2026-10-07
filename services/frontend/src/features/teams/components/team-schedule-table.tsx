"use client"

import { PUBLIC_PICKEM } from "astro:env/client"
import { lazy, Suspense } from "react"
import { ScheduleTable, type ScheduleTeam } from "@/features/teams/components/schedule-table"

export type { ScheduleGame } from "@/features/teams/components/schedule-table"

/**
 * The schedule with its Pick column. It is a separate script, and the browser loads it only when
 * Pick 'Em is on. When Pick 'Em is off, no page loads it.
 */
const ScheduleWithPicks = PUBLIC_PICKEM
  ? lazy(() =>
      import("@/features/pickem/components/schedule-with-picks").then((module) => ({
        default: module.ScheduleWithPicks,
      })),
    )
  : null

/**
 * The schedule of a team. When Pick 'Em is on, the table has a Pick column with thumbs for every
 * game. The board of picks loads when the table comes into view.
 */
export function TeamScheduleTable({ team }: { team: ScheduleTeam }) {
  if (!PUBLIC_PICKEM || !ScheduleWithPicks || team.schedule.length === 0) {
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
