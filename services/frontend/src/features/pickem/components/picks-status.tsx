"use client"

import { Note } from "@/components/ui/note"
import { usePicksBoard } from "@/features/pickem/components/picks-board"
import { pickErrorMessage } from "@/features/pickem/utils/pick-text"

const BLOCKED_TEXT = {
  unavailable: "Picks are not available right now. The schedule still shows.",
  unknown: "Picks are not available on this connection, because its network address is not known.",
} as const

/**
 * The one live region of the picks, above the schedule, and a sentence for screen readers that
 * tells how to pick. It shows nothing in the normal case. It tells screen readers when the picks
 * load, and shows a note when the visitor cannot pick or a pick did not save. The Pick column is
 * narrow, so no message goes there.
 */
export function PicksStatus({
  games,
  teamName,
}: {
  games: Record<string, string>
  teamName: string
}) {
  const board = usePicksBoard()
  const blocked = board?.blocked ?? null
  const errors = Object.entries(board?.errors ?? {})
  return (
    <>
      {/* The page shows no line that tells how to pick, so screen readers read it here once. */}
      <p className="sr-only">
        {`Thumbs up picks ${teamName} to win. Picks close at midnight in Ohio after game day.`}
      </p>
      {/* The region is always there, so a screen reader hears each change. */}
      <div role="status" className="empty:hidden">
        {board?.status === "loading" && <span className="sr-only">Loading picks</span>}
        {(blocked || errors.length > 0) && (
          <div className="mb-4 space-y-3">
            {blocked && <Note intent="warning">{BLOCKED_TEXT[blocked]}</Note>}
            {errors.map(([gameKey, code]) => (
              <Note key={gameKey} intent="danger">
                {`${games[gameKey] ?? "This game"}: ${pickErrorMessage(code)}`}
              </Note>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
