"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Link } from "@/components/ui/link"
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Text } from "@/components/ui/text"
import { paths } from "@/config/paths"
import type { MapMarker } from "@/features/map/utils/markers"
import { teamPlace } from "@/features/map/utils/team-place"
import { TeamLogo } from "@/features/teams/components/team-logo"
import { formatRating } from "@/features/teams/utils/format"

interface TeamListProps {
  label: string
  markers: readonly MapMarker[]
}

/** The schools on the map, best rated first. Each name links to the page of the team. */
export function TeamList({ label, markers }: TeamListProps) {
  const rows = [...markers].sort((first, second) => first.rank - second.rank)
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none [--gutter:--spacing(3)] sm:[--gutter:--spacing(4)]">
      <CardContent className="overflow-x-auto">
        <Table aria-label={label} bleed className="[--gutter-y:--spacing(2)]">
          <TableHeader className="bg-muted/70 text-xs/5 uppercase tracking-wide">
            <TableColumn className="w-12">Rank</TableColumn>
            <TableColumn isRowHeader>School</TableColumn>
            <TableColumn className="text-end">Rating</TableColumn>
          </TableHeader>
          <TableBody items={rows}>
            {(marker) => (
              <TableRow id={marker.id}>
                <TableCell className="font-semibold text-muted-fg tabular-nums">
                  {marker.rank}
                </TableCell>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <TeamLogo team={marker} size="sm" className="size-8 max-sm:hidden" />
                    <div className="min-w-0 max-sm:max-w-48">
                      <Link
                        href={paths.team.getHref(marker.id)}
                        className="block truncate font-medium text-fg hover:text-primary-subtle-fg"
                      >
                        {marker.name}
                      </Link>
                      <Text className="truncate text-xs/5 sm:text-xs/5">{teamPlace(marker)}</Text>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-end font-medium text-fg tabular-nums">
                  {formatRating(marker.rating)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
