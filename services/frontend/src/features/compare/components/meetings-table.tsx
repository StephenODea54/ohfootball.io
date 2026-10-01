"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { type Meeting, meetingWinner } from "@/features/compare/utils/head-to-head"
import { formatDayAndMonth } from "@/utils/format"

interface MeetingsTableProps {
  meetings: Meeting[]
  nameA: string
  nameB: string
}

/** Every game between the two schools, newest first. The score is from the side of the first. */
export function MeetingsTable({ meetings, nameA, nameB }: MeetingsTableProps) {
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none [--gutter:--spacing(4)]">
      <CardContent>
        <Table aria-label={`Games between ${nameA} and ${nameB}`} bleed>
          <TableHeader className="bg-muted/70 text-xs/5 uppercase tracking-wide">
            <TableColumn isRowHeader>Season</TableColumn>
            <TableColumn>Date</TableColumn>
            <TableColumn>Score</TableColumn>
            <TableColumn>Winner</TableColumn>
            <TableColumn className="text-end">Game</TableColumn>
          </TableHeader>
          <TableBody items={meetings}>
            {(meeting) => (
              <TableRow id={meeting.id}>
                <TableCell className="font-semibold text-muted-fg">{meeting.season}</TableCell>
                <TableCell className="text-muted-fg">{formatDayAndMonth(meeting.date)}</TableCell>
                <TableCell className="font-medium text-fg tabular-nums">
                  {meeting.teamScore}–{meeting.opponentScore}
                </TableCell>
                <TableCell className="text-fg">{meetingWinner(meeting, nameA, nameB)}</TableCell>
                <TableCell className="text-end">
                  {meeting.playoff ? (
                    <Badge intent="info" isCircle={false}>
                      Playoff
                    </Badge>
                  ) : (
                    <span className="text-muted-fg text-sm/5">Regular</span>
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
