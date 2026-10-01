"use client"

import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { CompareRow } from "@/features/compare/utils/season-series"
import { formatRank, formatRating } from "@/features/teams/utils/format"

interface CompareSeasonTableProps {
  rows: CompareRow[]
  nameA: string
  nameB: string
  seasonLabel: (season: number) => string
}

function Standing({ rating, rank }: { rating: number | null; rank: number | null }) {
  if (rating === null || rank === null) return <span className="text-muted-fg">—</span>
  return (
    <span className="tabular-nums">
      <span className="font-medium text-fg">{formatRating(rating)}</span>
      <span className="ms-2 text-muted-fg">{formatRank(rank)}</span>
    </span>
  )
}

/**
 * The rating and the rank of both schools in each season, newest first. The gap is the rating of
 * the first school minus the rating of the second, in the whole points that the cells show. It is
 * the text form of the chart.
 */
export function CompareSeasonTable({ rows, nameA, nameB, seasonLabel }: CompareSeasonTableProps) {
  const newestFirst = [...rows].reverse()

  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none [--gutter:--spacing(4)]">
      <CardContent>
        <Table aria-label={`Ratings of ${nameA} and ${nameB} by season`} bleed>
          <TableHeader className="bg-muted/70 text-xs/5 uppercase tracking-wide">
            <TableColumn isRowHeader>Season</TableColumn>
            <TableColumn>{nameA}</TableColumn>
            <TableColumn>{nameB}</TableColumn>
            <TableColumn className="text-end">Gap</TableColumn>
          </TableHeader>
          <TableBody items={newestFirst}>
            {(row) => (
              <TableRow id={row.season}>
                <TableCell className="font-semibold text-muted-fg">
                  {seasonLabel(row.season)}
                </TableCell>
                <TableCell>
                  <Standing rating={row.a} rank={row.rankA} />
                </TableCell>
                <TableCell>
                  <Standing rating={row.b} rank={row.rankB} />
                </TableCell>
                <TableCell className="text-end font-medium text-fg tabular-nums">
                  {row.a !== null && row.b !== null ? (
                    formatRating(row.a - row.b)
                  ) : (
                    <span className="text-muted-fg">—</span>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
