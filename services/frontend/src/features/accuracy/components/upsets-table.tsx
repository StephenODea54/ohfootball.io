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
import { ScoredTeamName } from "@/features/accuracy/components/scored-team-name"
import { TableCard, tableHeaderClass } from "@/features/accuracy/components/table-card"
import { formatPercent } from "@/features/accuracy/utils/format"
import type { LinkedScoredGame } from "@/features/accuracy/utils/team-links"
import { formatDate } from "@/utils/format"

/** The games that the model got most wrong: the winner had the lowest chance. */
export function UpsetsTable({ games, label }: { games: LinkedScoredGame[]; label: string }) {
  return (
    <TableCard>
      <Table aria-label={label} bleed>
        <TableHeader className={tableHeaderClass}>
          <TableColumn isRowHeader>Winner</TableColumn>
          <TableColumn className="max-sm:hidden">Loser</TableColumn>
          <TableColumn className="text-end">
            <span className="max-sm:hidden">Winner&rsquo;s </span>Chance
          </TableColumn>
          <TableColumn className="max-md:hidden">Date</TableColumn>
        </TableHeader>
        <TableBody items={games}>
          {(game) => (
            <TableRow id={game.id}>
              <TableCell>
                {/* A cell puts its content in a row, so one block keeps the two lines apart. */}
                <div>
                  <ScoredTeamName team={game.winner} />
                  <p className="mt-0.5 ps-8.5 text-muted-fg text-xs/5 sm:hidden">
                    beat {game.loser.name}
                    {game.loser.score !== null ? ` ${game.loser.score}` : ""}
                  </p>
                  <p className="mt-0.5 ps-8.5 text-muted-fg text-xs/5 md:hidden">
                    {formatDate(game.date)}
                  </p>
                </div>
              </TableCell>
              <TableCell className="max-sm:hidden">
                <ScoredTeamName team={game.loser} />
              </TableCell>
              <TableCell className="text-end">
                <Badge intent="danger" isCircle={false} className="font-semibold tabular-nums">
                  {formatPercent(game.winnerProbability)}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-fg max-md:hidden">{formatDate(game.date)}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableCard>
  )
}
