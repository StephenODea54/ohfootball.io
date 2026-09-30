import type { TeamRating } from "@/types/api"

export type RankDirection = "up" | "down" | "same"

export interface RankMovement {
  direction: RankDirection
  /** How many places the team moved. It is 0 when the rank did not change. */
  places: number
  /** The text the site shows, for example ↑3, ↓2, or a dash for no change. */
  text: string
  /** The words a screen reader says in place of the text. They are short, because a table row
   * that uses the rank as its name reads them on every row. */
  label: string
  /** The full sentence for a tooltip. */
  title: string
}

/**
 * How far a team moved in the ranks since the previous update. A lower rank is better, so a team
 * that goes from #15 to #12 moves up 3 places. Returns null when the API gives no previous rank
 * for the team.
 */
export function rankMovement(
  rating: Pick<TeamRating, "rank" | "previousRank">,
): RankMovement | null {
  if (rating.previousRank == null) return null

  const change = rating.previousRank - rating.rank
  if (change === 0) {
    return withTitle({ direction: "same", places: 0, text: "—", label: "No change" })
  }

  const places = Math.abs(change)
  const direction = change > 0 ? "up" : "down"
  return withTitle({
    direction,
    places,
    text: `${direction === "up" ? "↑" : "↓"}${places}`,
    label: `${direction === "up" ? "Up" : "Down"} ${places} ${places === 1 ? "place" : "places"}`,
  })
}

function withTitle(movement: Omit<RankMovement, "title">): RankMovement {
  return { ...movement, title: `${movement.label} in the last week` }
}
