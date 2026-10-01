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
import type { ConfidenceRow } from "@/features/accuracy/utils/chart-data"
import { formatCount, formatPercent, MISSING } from "@/features/accuracy/utils/format"

function percentText(value: number | null) {
  return value === null ? MISSING : `${value.toFixed(1)}%`
}

/** The numbers of the calibration chart, one row for each bin. */
export function ConfidenceTable({ rows }: { rows: ConfidenceRow[] }) {
  return (
    <TableCard>
      <Table aria-label="How often the favorite won, by how sure the model was" bleed>
        <TableHeader className={tableHeaderClass}>
          <TableColumn isRowHeader>
            Favorite<span className="max-sm:hidden"> At</span>
          </TableColumn>
          <TableColumn className="text-end max-sm:hidden">Games</TableColumn>
          <TableColumn className="text-end max-sm:hidden">Share</TableColumn>
          <TableColumn className="text-end">
            <span className="max-sm:hidden">Model </span>Said
          </TableColumn>
          <TableColumn className="text-end">
            <span className="max-sm:hidden">Favorite </span>Won
          </TableColumn>
        </TableHeader>
        <TableBody items={rows}>
          {(row) => (
            <TableRow id={row.id}>
              <TableCell className="font-medium text-fg">{row.label}</TableCell>
              <TableCell className="text-end text-muted-fg tabular-nums max-sm:hidden">
                {formatCount(row.games)}
              </TableCell>
              <TableCell className="text-end text-muted-fg tabular-nums max-sm:hidden">
                {formatPercent(row.share)}
              </TableCell>
              <TableCell className="text-end text-muted-fg tabular-nums">
                {percentText(row.predicted)}
              </TableCell>
              <TableCell className="text-end font-semibold text-fg tabular-nums">
                {percentText(row.observed)}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableCard>
  )
}
