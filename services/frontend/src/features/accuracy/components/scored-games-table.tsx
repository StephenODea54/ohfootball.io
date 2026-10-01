"use client"

import type { ReactNode } from "react"
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
import type { LinkedScoredGame } from "@/features/accuracy/utils/team-links"
import { formatDate } from "@/utils/format"

export interface ScoredGamesTableProps {
  games: LinkedScoredGame[]
  label: string
  /** The header of the column of values. */
  header: ReactNode
  /** The value of a game in the column of values. */
  cell: (game: LinkedScoredGame) => ReactNode
}

/**
 * A table of scored games, seen from the winner, with one column of values. On a small screen,
 * the loser and the date go under the winner.
 */
export function ScoredGamesTable({ games, label, header, cell }: ScoredGamesTableProps) {
  return (
    <TableCard>
      <Table aria-label={label} bleed>
        <TableHeader className={tableHeaderClass}>
          <TableColumn isRowHeader>Winner</TableColumn>
          <TableColumn className="max-sm:hidden">Loser</TableColumn>
          <TableColumn className="text-end">{header}</TableColumn>
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
              <TableCell className="text-end">{cell(game)}</TableCell>
              <TableCell className="text-muted-fg max-md:hidden">{formatDate(game.date)}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableCard>
  )
}
