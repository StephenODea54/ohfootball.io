"use client"

import { type ReactNode, useMemo, useRef } from "react"
import { FinalPick, NoPick, PickControl } from "@/features/pickem/components/pick-control"
import {
  PicksBoardProvider,
  useLoadBoardWhenVisible,
} from "@/features/pickem/components/picks-board"
import { PicksStatus } from "@/features/pickem/components/picks-status"
import { tallyKeys } from "@/features/pickem/utils/tally-keys"
import {
  type ScheduleGame,
  type SchedulePicks,
  ScheduleTable,
  type ScheduleTeam,
} from "@/features/teams/components/schedule-table"

/**
 * Loads the board of picks when any part of the table comes into view. The whole table is watched,
 * so a table that a browser shows already scrolled past its first game still loads the board.
 */
function LoadBoardWhenVisible({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLoadBoardWhenVisible(ref)
  return <div ref={ref}>{children}</div>
}

/**
 * The Pick cell of a game. The table moves focus between the buttons of the cell with the left and
 * right arrow keys, and to the next row with the up and down arrow keys. Disabled buttons take no
 * focus, so the table puts focus on their cell.
 */
function PickCell({ game, teamName }: { game: ScheduleGame; teamName: string }) {
  const names = { teamName, opponentName: game.opponentName }
  if (!game.pick) return <NoPick {...names} isCanceled={game.result === "CANCELED"} />
  const props = { ...names, pick: game.pick }
  return (
    <div className="inline-flex">
      {game.pick.winner === null ? <PickControl {...props} /> : <FinalPick {...props} />}
    </div>
  )
}

/** The schedule of a team with a Pick column. Every game has thumbs in it. */
export function ScheduleWithPicks({ team }: { team: ScheduleTeam }) {
  const games = Object.fromEntries(
    team.schedule.flatMap((game) =>
      game.pick ? [[game.pick.gameKey, `${team.name} vs ${game.opponentName}`]] : [],
    ),
  )
  // The same list on each draw, so the load of the board and its watcher are not made again.
  const tallies = useMemo(() => tallyKeys(team.schedule), [team.schedule])
  const picks: SchedulePicks = {
    cell: (game) => <PickCell game={game} teamName={team.name} />,
  }
  const table = <ScheduleTable team={team} picks={picks} />
  return (
    <PicksBoardProvider games={tallies}>
      <PicksStatus games={games} teamName={team.name} />
      {/* A schedule with no game that can have a tally needs no board. */}
      {tallies.length > 0 ? <LoadBoardWhenVisible>{table}</LoadBoardWhenVisible> : table}
    </PicksBoardProvider>
  )
}
