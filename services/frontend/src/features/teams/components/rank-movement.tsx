"use client"

import { twMerge } from "tailwind-merge"
import { type RankDirection, rankMovement } from "@/features/teams/utils/rank-movement"
import type { TeamRating } from "@/types/api"

const tones: Record<RankDirection, string> = {
  up: "text-success-subtle-fg",
  down: "text-danger-subtle-fg",
  same: "text-muted-fg",
}

/**
 * The move of a team in the ranks since the previous update, for example ↑3. The arrow and the
 * color show the direction. A screen reader hears the same fact in words, and a pointer that rests
 * on it shows the full sentence. Nothing shows when the season has no earlier update.
 */
export function RankMovement({
  rating,
  className,
}: {
  rating: Pick<TeamRating, "rank" | "previousRank">
  className?: string
}) {
  const movement = rankMovement(rating)
  if (!movement) return null

  return (
    <span
      title={movement.title}
      className={twMerge(
        "font-medium text-sm/5 tabular-nums",
        tones[movement.direction],
        className,
      )}
    >
      <span aria-hidden="true">{movement.text}</span>
      <span className="sr-only">{movement.label}</span>
    </span>
  )
}
