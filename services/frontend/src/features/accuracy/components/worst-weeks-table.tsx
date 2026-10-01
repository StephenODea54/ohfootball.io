"use client"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TableCard, tableHeaderClass } from "@/features/accuracy/components/table-card"
import type { WorstWeekRow } from "@/features/accuracy/utils/chart-data"
import { formatPercent, formatSigned, formatWeek } from "@/features/accuracy/utils/format"

/** The weeks with the largest gap between the winners the model expected to pick and picked. */
export function WorstWeeksTable({ rows }: { rows: WorstWeekRow[] }) {
  return (
    <TableCard>
      <Table
        aria-label="Hall of Shame: the weeks with the largest gap between the expected and the correct picks"
        bleed
      >
        <TableHeader className={tableHeaderClass}>
          <TableColumn isRowHeader>Week</TableColumn>
          <TableColumn className="text-end">Correct Predictions</TableColumn>
          <TableColumn className="text-end max-sm:hidden">Expected</TableColumn>
          <TableColumn className="text-end">Diff</TableColumn>
          <TableColumn className="text-end max-sm:hidden">Accuracy</TableColumn>
        </TableHeader>
        <TableBody items={rows}>
          {(row) => (
            <TableRow id={row.id}>
              <TableCell>
                {/* A cell puts its content in a row, so one block keeps the two lines apart. */}
                <div>
                  <p className="font-medium text-fg">
                    {formatWeek(row.week)}, {row.season}
                  </p>
                  <p className="text-muted-fg text-xs/5">{row.dates}</p>
                </div>
              </TableCell>
              <TableCell className="text-end text-fg tabular-nums">{row.correct}</TableCell>
              <TableCell className="text-end text-muted-fg tabular-nums max-sm:hidden">
                {row.expected.toFixed(0)}
              </TableCell>
              <TableCell className="text-end">
                <Badge intent="danger" isCircle={false} className="font-semibold tabular-nums">
                  {formatSigned(row.shortfall, 0)}
                </Badge>
              </TableCell>
              <TableCell className="text-end text-muted-fg tabular-nums max-sm:hidden">
                {formatPercent(row.accuracy)}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableCard>
  )
}
