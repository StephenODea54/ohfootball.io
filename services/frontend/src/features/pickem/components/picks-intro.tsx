"use client"

import { Note } from "@/components/ui/note"
import { Text, TextLink } from "@/components/ui/text"
import { paths } from "@/config/paths"
import { usePicksBoard } from "@/features/pickem/components/picks-board"
import { pickErrorMessage } from "@/features/pickem/utils/pick-text"

const BLOCKED_TEXT = {
  unavailable: "Picks are not available right now. The schedule still shows.",
  unknown: "Picks are not available on this connection, because its network address is not known.",
} as const

/**
 * The line above a schedule with a Pick column: how to pick, and a link to how picks are kept. It
 * holds the one live region of the picks. The region says when the picks load, why the visitor
 * cannot pick, and which pick did not save. The Pick column is narrow, so no message goes there.
 */
export function PicksIntro({ games }: { games: Record<string, string> }) {
  const board = usePicksBoard()
  const blocked = board?.blocked ?? null
  const errors = Object.entries(board?.errors ?? {})
  return (
    <div className="mb-4 space-y-3">
      <Text className="text-sm/6 sm:text-sm/6">
        Thumbs up picks this team to win. Picks close at midnight in Ohio after game day. One pick
        per network. <TextLink href={paths.privacy.getHref()}>How picks work</TextLink>
      </Text>
      {/* The region is always there, so a screen reader hears each change. */}
      <div role="status" className="space-y-3 empty:hidden">
        {board?.status === "loading" && <span className="sr-only">Loading picks</span>}
        {blocked && <Note intent="warning">{BLOCKED_TEXT[blocked]}</Note>}
        {errors.map(([gameKey, code]) => (
          <Note key={gameKey} intent="danger">
            {`${games[gameKey] ?? "This game"}: ${pickErrorMessage(code)}`}
          </Note>
        ))}
      </div>
    </div>
  )
}
