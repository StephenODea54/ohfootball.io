"use client"

import { twJoin } from "tailwind-merge"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Link } from "@/components/ui/link"
import { ProgressBar, ProgressBarTrack } from "@/components/ui/progress-bar"
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ScheduleGame } from "@/features/teams/utils/opponent-links"
import type { Game } from "@/types/api"
import { formatDayAndMonth } from "@/utils/format"

/**
 * Every game a school plays in a season, with the prediction made for it. The name of an opponent
 * that has a page links to that page.
 */
export function TeamScheduleTable({ team }: { team: { name: string; schedule: ScheduleGame[] } }) {
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none [--gutter:--spacing(4)]">
      <CardContent>
        <Table aria-label={`${team.name} Schedule`} bleed>
          <TableHeader className="bg-muted/70 text-xs/5 uppercase tracking-wide">
            <TableColumn isRowHeader>Wk</TableColumn>
            <TableColumn>Date</TableColumn>
            <TableColumn>Opponent</TableColumn>
            <TableColumn>Pred</TableColumn>
            <TableColumn>Win Probability</TableColumn>
            <TableColumn className="text-end">Result</TableColumn>
          </TableHeader>
          <TableBody items={team.schedule}>
            {(game) => {
              const probability = game.prediction
                ? Math.round(game.prediction.winProbability * 100)
                : null
              return (
                <TableRow id={game.id}>
                  <TableCell className="font-semibold text-muted-fg">{game.week}</TableCell>
                  <TableCell className="text-muted-fg">{formatDayAndMonth(game.date)}</TableCell>
                  <TableCell>
                    {/* The cell lays its children out with flex, which drops a plain
                          whitespace node, so the gap has to be a margin. */}
                    <span className="me-1 text-muted-fg">{locationLabel(game)}</span>
                    {game.opponentHref ? (
                      <Link
                        href={game.opponentHref}
                        className="font-medium text-fg hover:text-primary-subtle-fg"
                      >
                        {game.opponentName}
                      </Link>
                    ) : (
                      <span className="font-medium text-fg">{game.opponentName}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {game.prediction ? (
                      <Badge
                        intent={game.prediction.predictedResult === "WIN" ? "success" : "danger"}
                        isCircle={false}
                        className="text-sm/5 font-semibold"
                      >
                        {game.prediction.predictedResult === "WIN" ? "W" : "L"}
                      </Badge>
                    ) : (
                      <span className="text-muted-fg">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {probability !== null ? (
                      <div className="flex items-center gap-3">
                        <ProgressBar
                          aria-label={`${probability}% win probability`}
                          value={probability}
                          className="w-auto"
                        >
                          <ProgressBarTrack className="min-w-24 max-w-24 [--progress-content-bg:var(--color-success)]" />
                        </ProgressBar>
                        <span className="font-medium text-sm/5 text-muted-fg">{probability}%</span>
                      </div>
                    ) : (
                      <span className="text-muted-fg text-sm/5">Not Rated</span>
                    )}
                  </TableCell>
                  <TableCell className="text-end">
                    <GameResult game={game} />
                  </TableCell>
                </TableRow>
              )
            }}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function GameResult({ game }: { game: Game }) {
  if (game.result === "UNKNOWN") {
    return <span className="text-xs/5 uppercase tracking-wide text-muted-fg">Upcoming</span>
  }
  if (game.result === "CANCELED") {
    return <span className="text-xs/5 uppercase tracking-wide text-muted-fg">Canceled</span>
  }

  const label = game.result === "WIN" ? "W" : game.result === "LOSS" ? "L" : "T"
  const score =
    game.teamScore !== null && game.opponentScore !== null
      ? ` ${game.teamScore}–${game.opponentScore}`
      : ""
  const color =
    game.result === "WIN"
      ? "text-success-subtle-fg"
      : game.result === "LOSS"
        ? "text-danger-subtle-fg"
        : "text-muted-fg"

  return (
    <p className={twJoin("font-semibold text-sm/5", color)}>
      {label}
      {score}
    </p>
  )
}

function locationLabel(game: Game) {
  if (game.location === "AWAY") return "@"
  if (game.location === "NEUTRAL") return "vs*"
  return "vs"
}
