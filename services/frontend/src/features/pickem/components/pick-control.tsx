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
import { gameStatus, otherSide, type PickemResult, type PickSide } from "@/features/pickem/contract"
import { closesGame, finalPickText } from "@/features/pickem/utils/pick-text"
import type { TeamPick } from "@/features/pickem/utils/team-picks"

interface PickCellProps {
  pick: TeamPick
  teamName: string
  opponentName: string
}

const NO_PICKS: PickTally = { a: 0, b: 0 }

/** Thumbs up picks the page team, and thumbs down picks the opponent. */
type Thumb = "up" | "down"

const SMALL_TEXT = "text-xs/4 sm:text-xs/4"

function countText(count: number, name: string) {
  return `${count} ${count === 1 ? "pick" : "picks"} for ${name}`
}

/** What shows under the buttons. */
type Below =
  /** The count of picks of each side, under its button. */
  | { kind: "counts"; tally: PickTally }
  /** One short word under both buttons, and a sentence for screen readers. */
  | { kind: "word"; text: string; spoken: string }
  /** A dash under each button. */
  | { kind: "dashes" }

interface ThumbsProps {
  teamName: string
  opponentName: string
  /** The side of the page team in the games. Thumbs up picks it. */
  side: PickSide
  /** The name of the group of buttons. */
  label: string
  myPick: PickSide | null
  below: Below
  isDisabled: boolean
  onPick?: (side: PickSide | null) => void
}

/**
 * Two toggle buttons, with the count of picks or a dash under each, or a short word under both. A
 * press on the picked button removes the pick. The group allows more than one pressed button, so
 * each button is a toggle that screen readers announce as pressed or not. The change handler keeps
 * at most one pressed. Screen readers read the counts from one sentence, so the numbers are hidden
 * from them.
 */
function Thumbs({
  teamName,
  opponentName,
  side,
  label,
  myPick,
  below,
  isDisabled,
  onPick,
}: ThumbsProps) {
  const other = otherSide(side)
  const selected: Thumb | null = myPick ? (myPick === side ? "up" : "down") : null
  const choose = (keys: Set<Key>) => {
    const added = [...keys].find((key) => key !== selected) as Thumb | undefined
    onPick?.(added ? (added === "up" ? side : other) : null)
  }
  return (
    // A thumb that cannot be pressed shows the not-allowed cursor, on the buttons and around them.
    <div className={twJoin("inline-flex flex-col", isDisabled && "cursor-not-allowed")}>
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
          className="cursor-pointer selected:opacity-100 disabled:cursor-not-allowed [--toggle-selected-bg:var(--color-success-subtle)] [--toggle-selected-fg:var(--color-success-subtle-fg)]"
        >
          {({ isSelected }) => (isSelected ? <ThumbUpSolid /> : <ThumbUpOutline />)}
        </ToggleGroupItem>
        <ToggleGroupItem
          id="down"
          aria-label={`${opponentName} wins`}
          className="cursor-pointer selected:opacity-100 disabled:cursor-not-allowed [--toggle-selected-bg:var(--color-danger-subtle)] [--toggle-selected-fg:var(--color-danger-subtle-fg)]"
        >
          {({ isSelected }) => (isSelected ? <ThumbDownSolid /> : <ThumbDownOutline />)}
        </ToggleGroupItem>
      </ToggleGroup>
      {below.kind === "dashes" ? (
        <div aria-hidden="true" className="grid grid-cols-2 text-center">
          <Text className={SMALL_TEXT}>–</Text>
          <Text className={SMALL_TEXT}>–</Text>
        </div>
      ) : below.kind === "word" ? (
        <>
          <Text aria-hidden="true" className={twJoin("text-center", SMALL_TEXT)}>
            {below.text}
          </Text>
          <span className="sr-only">{below.spoken}</span>
        </>
      ) : (
        <>
          <div aria-hidden="true" className="grid grid-cols-2 text-center">
            <Text className={twJoin("tabular-nums", SMALL_TEXT)}>{below.tally[side]}</Text>
            <Text className={twJoin("tabular-nums", SMALL_TEXT)}>{below.tally[other]}</Text>
          </div>
          <span className="sr-only">
            {`${countText(below.tally[side], teamName)}, ${countText(below.tally[other], opponentName)}.`}
          </span>
        </>
      )}
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

/** The counts of a game, or a word when the board did not load and the counts are not known. */
function belowOf(board: PicksBoardValue, gameKey: string): Below {
  if (board.blocked === "unavailable") {
    return { kind: "word", text: "No counts", spoken: "Counts not available." }
  }
  return { kind: "counts", tally: board.tallies[gameKey] ?? NO_PICKS }
}

/** Whether the board answered, with picks or with a failure. */
function isSettled(board: PicksBoardValue | null): board is PicksBoardValue {
  return board?.status === "ready" || board?.status === "failed"
}

/**
 * The pick of one game that has no result. The buttons are read only once picks close, for a game
 * that the build does not take picks for, or when the visitor cannot pick. They still show the pick
 * of the visitor and the counts then.
 */
export function PickControl({ pick, teamName, opponentName }: PickCellProps) {
  const board = usePicksBoard()
  if (!isSettled(board)) return <PickSkeleton />

  // The lock is read against the moment the board loaded, so a page drawn by the build and opened
  // after the lock shows the game as closed. A pick made after the lock gets GAME_LOCKED back, and
  // that closes the game too. The board sets the moment with its status, so a control never reads
  // the clock itself.
  const status =
    pick.takesPicks && board.readyAt
      ? gameStatus({ canceled: false, result: null, lockAt: pick.lockAt }, board.readyAt)
      : "locked"
  const error = board.errors[pick.gameKey]
  const isOpen = status === "open" && !(error && closesGame(error))
  return (
    <>
      <Thumbs
        teamName={teamName}
        opponentName={opponentName}
        side={pick.side}
        label={`Pick the winner of ${teamName} vs ${opponentName}`}
        myPick={board.picks[pick.gameKey] ?? null}
        below={belowOf(board, pick.gameKey)}
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
 * A game with a result in the last days: the final counts, read only. When the visitor picked the
 * game, the picked thumb and a mark for correct, missed, or a game with no winner.
 */
export function FinalPick({ pick, teamName, opponentName }: PickCellProps) {
  const board = usePicksBoard()
  if (!isSettled(board)) return <PickSkeleton />
  if (!pick.winner) return null

  const myPick = board.picks[pick.gameKey] ?? null
  const thumbs = (
    <Thumbs
      teamName={teamName}
      opponentName={opponentName}
      side={pick.side}
      label={`${myPick ? "Your pick" : "Picks"} for ${teamName} vs ${opponentName}`}
      myPick={myPick}
      below={belowOf(board, pick.gameKey)}
      isDisabled
    />
  )
  if (!myPick) return thumbs

  const picked = myPick === pick.side ? teamName : opponentName
  const { Icon, color } = MARKS[markOf(pick.winner, myPick)]
  return (
    <div className="inline-flex items-start gap-1">
      {thumbs}
      <Icon aria-hidden="true" className={twJoin("mt-1.5 size-4 shrink-0", color)} />
      <span className="sr-only">{finalPickText(picked, myPick, pick.winner)}</span>
    </div>
  )
}

/**
 * The thumbs of a game that never takes picks: a canceled game, or a game against a team from
 * another state. They are greyed and disabled, with a dash in place of each count. Screen readers
 * skip the buttons and read one sentence with the reason.
 */
export function NoPick({
  teamName,
  opponentName,
  isCanceled,
}: {
  teamName: string
  opponentName: string
  isCanceled: boolean
}) {
  const reason = isCanceled ? "the game was canceled" : "picks are not open for this game"
  return (
    <>
      <div aria-hidden="true" className="inline-flex">
        <Thumbs
          teamName={teamName}
          opponentName={opponentName}
          side="a"
          label="No picks"
          myPick={null}
          below={{ kind: "dashes" }}
          isDisabled
        />
      </div>
      <span className="sr-only">{`${teamName} vs ${opponentName}: ${reason}.`}</span>
    </>
  )
}
