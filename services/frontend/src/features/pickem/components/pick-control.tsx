"use client"

import { CheckCircleIcon, MinusCircleIcon, XCircleIcon } from "@heroicons/react/20/solid"
import {
  HandThumbDownIcon as ThumbDownOutline,
  HandThumbUpIcon as ThumbUpOutline,
} from "@heroicons/react/24/outline"
import {
  HandThumbDownIcon as ThumbDownSolid,
  HandThumbUpIcon as ThumbUpSolid,
} from "@heroicons/react/24/solid"
import type { Key } from "react-aria-components/ToggleButtonGroup"
import { twJoin } from "tailwind-merge"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { PickTally } from "@/features/pickem/api/picks-client"
import { type PicksBoardValue, usePicksBoard } from "@/features/pickem/components/picks-board"
import { gameStatus, type PickemResult, type PickSide } from "@/features/pickem/contract"
import { closesGame, finalPickText } from "@/features/pickem/utils/pick-text"
import { otherSide, type TeamPick } from "@/features/pickem/utils/team-picks"

interface PickCellProps {
  pick: TeamPick
  teamName: string
  opponentName: string
}

const NO_PICKS: PickTally = { a: 0, b: 0 }

/** Thumbs up picks the page team, and thumbs down picks the opponent. */
type Thumb = "up" | "down"

function thumbOf(pick: TeamPick, side: PickSide | null): Thumb | null {
  if (!side) return null
  return side === pick.side ? "up" : "down"
}

function sideOf(pick: TeamPick, thumb: Thumb): PickSide {
  return thumb === "up" ? pick.side : otherSide(pick.side)
}

function countText(count: number, name: string) {
  return `${count} ${count === 1 ? "pick" : "picks"} for ${name}`
}

interface ThumbsProps extends PickCellProps {
  /** The name of the group of buttons. */
  label: string
  myPick: PickSide | null
  tally: PickTally
  isDisabled: boolean
  onPick?: (side: PickSide | null) => void
}

/**
 * Two toggle buttons and the count of picks under each. A press on the picked button removes the
 * pick. The group allows more than one pressed button, so each button is a toggle that screen
 * readers announce as pressed or not. The change handler keeps at most one pressed. Screen readers
 * read the counts from one sentence, so the numbers are hidden from them.
 */
function Thumbs({
  pick,
  teamName,
  opponentName,
  label,
  myPick,
  tally,
  isDisabled,
  onPick,
}: ThumbsProps) {
  const selected = thumbOf(pick, myPick)
  const up = tally[pick.side]
  const down = tally[otherSide(pick.side)]
  const choose = (keys: Set<Key>) => {
    const added = [...keys].find((key) => key !== selected) as Thumb | undefined
    onPick?.(added ? sideOf(pick, added) : null)
  }
  return (
    <div className="inline-flex flex-col">
      <ToggleGroup
        aria-label={label}
        selectionMode="multiple"
        size="sq-xs"
        selectedKeys={selected ? [selected] : []}
        onSelectionChange={choose}
        isDisabled={isDisabled}
        className="[--btn-icon-active:currentColor] [--btn-icon:currentColor] [--toggle-fg:var(--color-muted-fg)]"
      >
        <ToggleGroupItem
          id="up"
          aria-label={`${teamName} wins`}
          className="selected:opacity-100 [--toggle-selected-bg:var(--color-success-subtle)] [--toggle-selected-fg:var(--color-success-subtle-fg)]"
        >
          {({ isSelected }) => (isSelected ? <ThumbUpSolid /> : <ThumbUpOutline />)}
        </ToggleGroupItem>
        <ToggleGroupItem
          id="down"
          aria-label={`${opponentName} wins`}
          className="selected:opacity-100 [--toggle-selected-bg:var(--color-danger-subtle)] [--toggle-selected-fg:var(--color-danger-subtle-fg)]"
        >
          {({ isSelected }) => (isSelected ? <ThumbDownSolid /> : <ThumbDownOutline />)}
        </ToggleGroupItem>
      </ToggleGroup>
      <div aria-hidden="true" className="grid grid-cols-2 text-center">
        <Text className="text-xs/4 tabular-nums sm:text-xs/4">{up}</Text>
        <Text className="text-xs/4 tabular-nums sm:text-xs/4">{down}</Text>
      </div>
      <span className="sr-only">
        {`${countText(up, teamName)}, ${countText(down, opponentName)}.`}
      </span>
    </div>
  )
}

/** The shape of the buttons while the board loads. Screen readers skip it. */
function PickSkeleton() {
  return (
    <Skeleton isLoading aria-hidden="true" className="inline-block">
      <div className="flex gap-0.5">
        <div>
          <span className="block size-8 sm:size-7" />
        </div>
        <div>
          <span className="block size-8 sm:size-7" />
        </div>
      </div>
    </Skeleton>
  )
}

/**
 * The pick of one game that has no result. The buttons are read only once picks close or when the
 * visitor cannot pick, and they still show the pick of the visitor then.
 */
export function PickControl({ pick, teamName, opponentName }: PickCellProps) {
  const board = usePicksBoard()
  if (!board || board.status === "idle" || board.status === "loading") return <PickSkeleton />

  // The lock is read against the moment the board loaded, so a page drawn by the build and opened
  // after the lock shows the game as closed. A pick made after the lock gets GAME_LOCKED back, and
  // that closes the game too. The board sets the moment with its status, so a control never reads
  // the clock itself.
  const status = board.readyAt
    ? gameStatus({ canceled: false, result: null, lockAt: pick.lockAt }, board.readyAt)
    : "locked"
  const error = board.errors[pick.gameKey]
  const isOpen = status === "open" && !(error && closesGame(error))
  return (
    <>
      <Thumbs
        pick={pick}
        teamName={teamName}
        opponentName={opponentName}
        label={`Pick the winner of ${teamName} vs ${opponentName}`}
        myPick={board.picks[pick.gameKey] ?? null}
        tally={board.tallies[pick.gameKey] ?? NO_PICKS}
        isDisabled={!isOpen || board.blocked !== null}
        onPick={(side) => board.choose(pick.gameKey, side)}
      />
      {!isOpen && <span className="sr-only">Picks closed.</span>}
    </>
  )
}

const MARKS = {
  correct: { Icon: CheckCircleIcon, color: "text-success-subtle-fg" },
  missed: { Icon: XCircleIcon, color: "text-danger-subtle-fg" },
  neutral: { Icon: MinusCircleIcon, color: "text-muted-fg" },
} as const

function markOf(winner: PickemResult["winner"], myPick: PickSide): keyof typeof MARKS {
  if (winner === "tie" || winner === "none") return "neutral"
  return winner === myPick ? "correct" : "missed"
}

/**
 * How the pick of the visitor did in a game with a result: the picked thumb, the final counts, and
 * a mark for correct, missed, or a game with no winner. It shows nothing when the visitor did not
 * pick the game.
 */
export function FinalPick({ pick, teamName, opponentName }: PickCellProps) {
  const board = usePicksBoard()
  const myPick = board?.status === "ready" ? (board.picks[pick.gameKey] ?? null) : null
  if (!board || !myPick || !pick.winner) return null

  const picked = myPick === pick.side ? teamName : opponentName
  const { Icon, color } = MARKS[markOf(pick.winner, myPick)]
  return (
    <div className="inline-flex items-start gap-1">
      <Thumbs
        pick={pick}
        teamName={teamName}
        opponentName={opponentName}
        label={`Your pick for ${teamName} vs ${opponentName}`}
        myPick={myPick}
        tally={board.tallies[pick.gameKey] ?? NO_PICKS}
        isDisabled
      />
      <Icon aria-hidden="true" className={twJoin("mt-1.5 size-4 shrink-0", color)} />
      <span className="sr-only">{finalPickText(picked, myPick, pick.winner)}</span>
    </div>
  )
}

/**
 * Whether the Pick cell of a game shows anything. A game with no result always does. A game with a
 * result does only when the visitor picked it.
 */
export function showsPick(pick: TeamPick | null, board: PicksBoardValue | null): boolean {
  if (!pick || !board) return false
  if (pick.winner === null) return true
  return board.status === "ready" && pick.gameKey in board.picks
}
