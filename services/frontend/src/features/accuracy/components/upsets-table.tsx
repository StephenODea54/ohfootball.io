"use client"

import { Badge } from "@/components/ui/badge"
import { ScoredGamesTable } from "@/features/accuracy/components/scored-games-table"
import { formatPercent } from "@/features/accuracy/utils/format"
import type { LinkedScoredGame } from "@/features/accuracy/utils/team-links"

/** The games that the model got most wrong: the winner had the lowest chance. */
export function UpsetsTable({ games, label }: { games: LinkedScoredGame[]; label: string }) {
  return (
    <ScoredGamesTable
      games={games}
      label={label}
      header={
        <>
          <span className="max-sm:hidden">Winner&rsquo;s </span>Chance
        </>
      }
      cell={(game) => (
        <Badge intent="danger" isCircle={false} className="font-semibold tabular-nums">
          {formatPercent(game.winnerProbability)}
        </Badge>
      )}
    />
  )
}
