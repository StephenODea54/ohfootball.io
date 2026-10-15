"use client"

import { twJoin } from "tailwind-merge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { OddsBar } from "@/features/playoffs/components/odds-bar"
import type { PlayoffRow } from "@/features/playoffs/types"
import { TeamLogo } from "@/features/teams/components/team-logo"

interface OddsTableProps {
  label: string
  teams: PlayoffRow[]
  qualifiers: number
  byes: number
  onSelect: (sourceId: string) => void
}

/** A header with a short form for a narrow screen. */
function Header({ long, short }: { long: string; short: string }) {
  return (
    <>
      <span className="max-sm:hidden">{long}</span>
      <span className="sm:hidden">{short}</span>
    </>
  )
}

/**
 * The teams of one region in the order that the API gives, which reads like the likely final
 * order. A dashed line marks the last seed with a bye and the last team in. A row opens the
 * details of its team. In a season without byes, the middle column is the chance of a home game.
 */
export function OddsTable({ label, teams, qualifiers, byes, onSelect }: OddsTableProps) {
  const rows = teams.map((team, index) => ({ ...team, id: team.sourceId, place: index + 1 }))
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none [--gutter:--spacing(3)] sm:[--gutter:--spacing(4)]">
      <CardContent className="overflow-x-auto">
        <Table
          aria-label={label}
          bleed
          className="[--gutter-y:--spacing(2)]"
          onRowAction={(key) => onSelect(String(key))}
        >
          <TableHeader className="bg-muted/70 text-xs/5 uppercase tracking-wide">
            <TableColumn className="w-8">#</TableColumn>
            <TableColumn isRowHeader>Team</TableColumn>
            <TableColumn className="text-end max-sm:hidden">Rating</TableColumn>
            <TableColumn>
              <Header long="Make Playoffs" short="Playoffs" />
            </TableColumn>
            <TableColumn>
              {byes > 0 ? (
                <Header long={`Top ${byes} Seed`} short={`Top ${byes}`} />
              ) : (
                <Header long="Home Game" short="Home" />
              )}
            </TableColumn>
            <TableColumn>
              <Header long="Win Region" short="Region" />
            </TableColumn>
          </TableHeader>
          <TableBody items={rows}>
            {(team) => (
              <TableRow
                id={team.id}
                className={twJoin(
                  "cursor-pointer",
                  (team.place === byes || team.place === qualifiers) &&
                    "*:border-dashed *:border-b-muted-fg",
                )}
              >
                <TableCell className="text-muted-fg tabular-nums">{team.place}</TableCell>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-2">
                    <TeamLogo team={team} size="xs" className="max-sm:hidden" />
                    <span className="max-w-36 truncate font-medium text-fg">{team.name}</span>
                    <span className="shrink-0 text-muted-fg text-xs/4 tabular-nums max-sm:hidden">
                      {team.record}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-end text-muted-fg tabular-nums max-sm:hidden">
                  {team.rating === null ? "–" : team.rating.toFixed(1)}
                </TableCell>
                <TableCell>
                  <OddsBar probability={team.qualifyProbability} />
                </TableCell>
                <TableCell>
                  <OddsBar probability={byes > 0 ? team.byeProbability : team.homeProbability} />
                </TableCell>
                <TableCell>
                  <OddsBar probability={team.regionWinProbability} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
