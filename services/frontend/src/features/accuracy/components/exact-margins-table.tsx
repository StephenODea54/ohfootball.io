"use client"

import { Badge } from "@/components/ui/badge"
import { ScoredGamesTable } from "@/features/accuracy/components/scored-games-table"
import type { LinkedScoredGame } from "@/features/accuracy/utils/team-links"
import { formatMargin } from "@/features/teams/utils/format"

/** The games in which the model called the final margin exactly. */
export function ExactMarginsTable({ games, label }: { games: LinkedScoredGame[]; label: string }) {
  return (
    <ScoredGamesTable
      games={games}
      label={label}
      header="Call"
      cell={(game) => (
        <Badge intent="success" isCircle={false} className="font-semibold tabular-nums">
          {formatMargin(game.winnerPredictedMargin)}
        </Badge>
      )}
    />
  )
}
