"use client"

import { type ReactNode, useRef } from "react"
import { FinalPick, PickControl, showsPick } from "@/features/pickem/components/pick-control"
import {
  PicksBoardProvider,
  useLoadBoardWhenVisible,
  usePicksBoard,
} from "@/features/pickem/components/picks-board"
import { PicksIntro } from "@/features/pickem/components/picks-intro"
import {
  type ScheduleGame,
  type SchedulePicks,
  ScheduleTable,
  type ScheduleTeam,
} from "@/features/teams/components/schedule-table"

/** Loads the board of picks when its children come into view. */
function LoadBoardWhenVisible({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLoadBoardWhenVisible(ref)
  return <span ref={ref}>{children}</span>
}

/**
 * The Pick cell of a game that takes picks, or took them in the last days. The table moves focus
 * between the buttons of the cell with the left and right arrow keys, and to the next row with the
 * up and down arrow keys.
 */
function PickCell({ game, teamName }: { game: ScheduleGame; teamName: string }) {
  if (!game.pick) return null
  const props = { pick: game.pick, teamName, opponentName: game.opponentName }
  return (
    <div className="inline-flex">
      {game.pick.winner === null ? <PickControl {...props} /> : <FinalPick {...props} />}
    </div>
  )
}

function PickedTable({ team }: { team: ScheduleTeam }) {
  const board = usePicksBoard()
  const picks: SchedulePicks = {
    hasColumn: team.schedule.some((game) => showsPick(game.pick, board)),
    cell: (game) =>
      showsPick(game.pick, board) ? <PickCell game={game} teamName={team.name} /> : null,
    week: (game) =>
      game.pick ? <LoadBoardWhenVisible>{game.week}</LoadBoardWhenVisible> : game.week,
  }
  return <ScheduleTable team={team} picks={picks} />
}

/** The schedule of a team with a Pick column for the games that take picks. */
export function ScheduleWithPicks({ team }: { team: ScheduleTeam }) {
  const games = Object.fromEntries(
    team.schedule.flatMap((game) =>
      game.pick ? [[game.pick.gameKey, `${team.name} vs ${game.opponentName}`]] : [],
    ),
  )
  return (
    <PicksBoardProvider>
      <PicksIntro games={games} />
      <PickedTable team={team} />
    </PicksBoardProvider>
  )
}
