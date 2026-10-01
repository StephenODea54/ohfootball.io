"use client"

import { ProgramDecadesTable } from "@/features/teams/components/program-decades-table"
import { ProgramHighlights } from "@/features/teams/components/program-highlights"
import { ProgramSeasonsTable } from "@/features/teams/components/program-seasons-table"
import { decadeRows, type SeasonRow } from "@/features/teams/utils/program-history"

/**
 * The history of a program: the highlights, the table of seasons, and the table of decades. The
 * three parts share one island, so the page embeds the rows of the seasons one time.
 */
export function ProgramHistory({ team }: { team: { name: string; rows: SeasonRow[] } }) {
  return (
    <div className="grid gap-6">
      <ProgramHighlights rows={team.rows} />
      <ProgramSeasonsTable team={team} />
      <ProgramDecadesTable team={{ name: team.name, decades: decadeRows(team.rows) }} />
    </div>
  )
}
