"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { InfoButton } from "@/features/teams/components/info-button"
import { formatRank, formatRecord } from "@/features/teams/utils/format"
import { COUNTED_SEASONS_NOTE, type DecadeRow } from "@/features/teams/utils/program-history"

/**
 * The complete seasons of a program, one row for each decade. The card shows nothing when the
 * program has fewer than two decades, because one row tells nothing that the highlights do not.
 */
export function ProgramDecadesTable({ team }: { team: { name: string; decades: DecadeRow[] } }) {
  if (team.decades.length < 2) return null

  return (
    <Card className="shadow-none [--gutter:--spacing(4)] sm:[--gutter:--spacing(6)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-1">
          By Decade
          <InfoButton label="By Decade" note={COUNTED_SEASONS_NOTE} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table aria-label={`${team.name} By Decade`} bleed>
          <TableHeader className="bg-muted/70 text-xs/5 uppercase tracking-wide">
            <TableColumn isRowHeader>Decade</TableColumn>
            <TableColumn className="text-end">Seasons</TableColumn>
            <TableColumn>Record</TableColumn>
            {/* On a narrow screen this column is hidden. The table has no selection. */}
            <TableColumn className="text-end max-sm:hidden">Playoff Appearances</TableColumn>
            <TableColumn className="text-end">Median Rank</TableColumn>
            <TableColumn className="text-end">Best Rank</TableColumn>
          </TableHeader>
          <TableBody items={team.decades}>
            {(decade) => (
              <TableRow id={decade.id}>
                <TableCell className="font-semibold text-fg">{decade.id}</TableCell>
                <TableCell className="text-end">{decade.seasons}</TableCell>
                <TableCell>{formatRecord(decade.record)}</TableCell>
                <TableCell className="text-end max-sm:hidden">
                  {decade.playoffAppearances}
                </TableCell>
                <TableCell className="text-end">{rankOrDash(decade.medianRank)}</TableCell>
                <TableCell className="text-end">{rankOrDash(decade.bestRank)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function rankOrDash(rank: number | null) {
  return rank !== null ? formatRank(rank) : <span className="text-muted-fg">—</span>
}
