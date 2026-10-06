"use client"

import type { ReactNode } from "react"
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
import type { PickedGame } from "@/features/pickem/utils/team-picks"
import { TeamLogo } from "@/features/teams/components/team-logo"
import {
  formatMargin,
  formatRank,
  formatRating,
  marginIntent,
  winPercent,
} from "@/features/teams/utils/format"
import type { LinkedGame } from "@/features/teams/utils/opponent-links"
import type { LogoGame } from "@/features/teams/utils/opponent-logos"
import type { OpponentStanding, StandingGame } from "@/features/teams/utils/opponent-standings"
import type { Game } from "@/types/api"
import { formatDayAndMonth } from "@/utils/format"

/**
 * A row of the schedule: the game, the link to the opponent, the standing of the opponent, the
 * number of the opponent for its logo, and the pick of the game.
 */
export type ScheduleGame = PickedGame<LogoGame<StandingGame<LinkedGame>>>

export interface ScheduleTeam {
  name: string
  schedule: ScheduleGame[]
}

/** What the table shows for the picks of its games. */
export interface SchedulePicks {
  /** Whether the table has the Pick column. */
  hasColumn: boolean
  /** The Pick cell of a game. It is empty for a game that takes no picks. */
  cell: (game: ScheduleGame) => ReactNode
  /** The week of a game, in the first cell of its row. */
  week: (game: ScheduleGame) => ReactNode
}

/**
 * Every game a school plays in a season, with the prediction made for it and the current rank and
 * rating of each opponent. The name of an opponent that has a page links to that page. On a narrow
 * screen the rank and rating move under the name of the opponent, so the table stays narrow.
 *
 * With `picks`, the table can have a Pick column. It is the last column, so on a phone it is in
 * view after a scroll to the side, as the other columns at the end are.
 */
export function ScheduleTable({ team, picks }: { team: ScheduleTeam; picks?: SchedulePicks }) {
  const hasPicks = picks?.hasColumn === true
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none [--gutter:--spacing(4)]">
      <CardContent>
        <Table aria-label={`${team.name} Schedule`} bleed>
          <TableHeader className="bg-muted/70 text-xs/5 uppercase tracking-wide">
            <TableColumn isRowHeader>Wk</TableColumn>
            <TableColumn>Date</TableColumn>
            <TableColumn>Opponent</TableColumn>
            {/* On a narrow screen these two columns are hidden, and the arrow keys move through
              them without a visible change. The table has no selection, so this is acceptable. */}
            <TableColumn className="text-end max-sm:hidden">Rank</TableColumn>
            <TableColumn className="text-end max-sm:hidden">Rating</TableColumn>
            <TableColumn>Pred</TableColumn>
            <TableColumn>Win Probability</TableColumn>
            <TableColumn className="text-end">Result</TableColumn>
            {hasPicks && <TableColumn className="text-center">Pick</TableColumn>}
          </TableHeader>
          {/* The rows read the picks, so they are drawn again when the picks change. */}
          <TableBody items={team.schedule} dependencies={[picks]}>
            {(game) => {
              const probability = game.prediction
                ? winPercent(game.prediction.winProbability)
                : null
              return (
                <TableRow id={game.id}>
                  <TableCell className="font-semibold text-muted-fg">
                    {picks ? picks.week(game) : game.week}
                  </TableCell>
                  <TableCell className="text-muted-fg">{formatDayAndMonth(game.date)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <TeamLogo
                        team={{ sourceId: game.opponentSourceId, name: game.opponentName }}
                        size="xs"
                      />
                      <div>
                        <p>
                          {/* JSX drops the line break between the label and the name, so the
                          gap must be a margin. */}
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
                        </p>
                        {game.opponentStanding && (
                          <p className="text-muted-fg text-xs/5 sm:hidden">
                            {standingLabel(game.opponentStanding)}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-end text-muted-fg max-sm:hidden">
                    {game.opponentStanding ? formatRank(game.opponentStanding.rank) : "—"}
                  </TableCell>
                  <TableCell className="text-end max-sm:hidden">
                    {game.opponentStanding ? (
                      <span className="font-medium text-fg">
                        {formatRating(game.opponentStanding.value)}
                      </span>
                    ) : (
                      <span className="text-muted-fg">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {game.prediction ? (
                      <Badge
                        intent={marginIntent(game.prediction.predictedMargin)}
                        isCircle={false}
                        className="text-sm/5 font-semibold"
                      >
                        {formatMargin(game.prediction.predictedMargin)}
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
                  {hasPicks && <TableCell className="text-center">{picks?.cell(game)}</TableCell>}
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

function standingLabel(standing: OpponentStanding) {
  return `${formatRank(standing.rank)} · ${formatRating(standing.value)}`
}

function locationLabel(game: Game) {
  if (game.location === "AWAY") return "@"
  if (game.location === "NEUTRAL") return "vs*"
  return "vs"
}
