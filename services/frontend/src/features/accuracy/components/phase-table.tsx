"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TableCard, tableHeaderClass } from "@/features/accuracy/components/table-card"
import type { PhaseRow } from "@/features/accuracy/utils/chart-data"
import { formatCount, formatPercent, formatScore } from "@/features/accuracy/utils/format"

/** The scores of each phase of the season. */
export function PhaseTable({ rows }: { rows: PhaseRow[] }) {
  return (
    <TableCard>
      <Table aria-label="Accuracy by phase of the season" bleed>
        <TableHeader className={tableHeaderClass}>
          <TableColumn isRowHeader>Phase</TableColumn>
          <TableColumn className="text-end">Games</TableColumn>
          <TableColumn className="text-end">Winners</TableColumn>
          <TableColumn className="text-end max-sm:hidden">Brier</TableColumn>
          <TableColumn className="text-end max-sm:hidden">Log Loss</TableColumn>
        </TableHeader>
        <TableBody items={rows}>
          {(row) => (
            <TableRow id={row.id}>
              <TableCell className="font-medium text-fg">{row.label}</TableCell>
              <TableCell className="text-end text-muted-fg tabular-nums">
                {formatCount(row.games)}
              </TableCell>
              <TableCell className="text-end font-semibold text-fg tabular-nums">
                {formatPercent(row.accuracy)}
              </TableCell>
              <TableCell className="text-end text-muted-fg tabular-nums max-sm:hidden">
                {formatScore(row.brierScore)}
              </TableCell>
              <TableCell className="text-end text-muted-fg tabular-nums max-sm:hidden">
                {formatScore(row.logLoss)}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableCard>
  )
}
