"use client"

import { useState } from "react"
import { twJoin } from "tailwind-merge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatRank, formatRating, formatRecord, ratingTone } from "@/features/teams/utils/format"
import {
  gamesPlayed,
  RECENT_SEASONS,
  type SeasonRow,
  visibleSeasons,
} from "@/features/teams/utils/program-history"

/**
 * Every season of a program, newest first, with the record, the playoff record, and the rating and
 * the rank at the end of the season. The table shows the recent seasons first, and a button shows
 * all of them. On a narrow screen the playoff record is hidden.
 */
export function ProgramSeasonsTable({ team }: { team: { name: string; rows: SeasonRow[] } }) {
  const [showAll, setShowAll] = useState(false)
  const items = visibleSeasons(team.rows, showAll)

  return (
    <Card className="shadow-none [--gutter:--spacing(4)] sm:[--gutter:--spacing(6)]">
      <CardHeader title="Seasons" />
      <CardContent>
        <Table aria-label={`${team.name} Seasons`} bleed>
          <TableHeader className="bg-muted/70 text-xs/5 uppercase tracking-wide">
            <TableColumn isRowHeader>Season</TableColumn>
            <TableColumn>Record</TableColumn>
            {/* On a narrow screen this column is hidden, and the arrow keys move through it without
              a visible change. The table has no selection, so this is acceptable. */}
            <TableColumn className="max-sm:hidden">Playoff Record</TableColumn>
            <TableColumn className="text-end">Rating</TableColumn>
            <TableColumn className="text-end">Rank</TableColumn>
          </TableHeader>
          <TableBody items={items}>
            {(row) => (
              <TableRow id={row.season}>
                <TableCell>
                  {/* Below sm the badge moves under the year, so the first column stays narrow. */}
                  <p className="flex flex-col items-start gap-1 font-semibold text-fg sm:flex-row sm:items-center sm:gap-2">
                    {row.season}
                    {row.inProgress && (
                      <Badge intent="secondary" isCircle={false}>
                        In Progress
                      </Badge>
                    )}
                  </p>
                </TableCell>
                <TableCell>{formatRecord(row.record)}</TableCell>
                <TableCell className="text-muted-fg max-sm:hidden">
                  {gamesPlayed(row.playoffRecord) > 0 ? formatRecord(row.playoffRecord) : "—"}
                </TableCell>
                <TableCell className="text-end">
                  {row.rating !== null ? (
                    <span className={twJoin("font-medium", ratingTone(row.rating))}>
                      {formatRating(row.rating)}
                    </span>
                  ) : (
                    <span className="text-muted-fg">—</span>
                  )}
                </TableCell>
                <TableCell className="text-end">
                  {row.rank !== null ? (
                    <span className="font-medium text-fg">{formatRank(row.rank)}</span>
                  ) : (
                    <span className="text-muted-fg">—</span>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
      {team.rows.length > RECENT_SEASONS && (
        <CardFooter>
          <Button intent="outline" size="sm" onPress={() => setShowAll(!showAll)}>
            {showAll ? "Show Less" : "Show More"}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
