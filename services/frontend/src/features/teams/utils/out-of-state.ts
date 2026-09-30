import type { TeamSummary } from "@/types/api"

/** A school with this many played games against out-of-state teams, or more, gets a mark. */
export const OUT_OF_STATE_MARK_AT = 2

/** The note that goes with the mark. */
export interface OutOfStateNote {
  count: number
  /** The short name of the button, for a screen reader. */
  label: string
  /** The sentence in the popover. */
  text: string
}

/** Tells in one sentence how many games the rating leaves out. */
export function outOfStateText(count: number): string {
  return count === 1
    ? "1 game against an out-of-state team does not count toward this rating."
    : `${count} games against out-of-state teams do not count toward this rating.`
}

/**
 * Gives the note for a school, or null when the school has too few played games against
 * out-of-state teams to get a mark.
 */
export function outOfStateNote(
  team: Pick<TeamSummary, "outOfStateGamesPlayed">,
): OutOfStateNote | null {
  const count = team.outOfStateGamesPlayed
  if (!Number.isFinite(count) || count < OUT_OF_STATE_MARK_AT) return null
  return {
    count,
    label: `${count} out-of-state games not in this rating`,
    text: outOfStateText(count),
  }
}

/** Tells if one school or more in the list gets a mark. */
export function hasOutOfStateNote(
  teams: readonly Pick<TeamSummary, "outOfStateGamesPlayed">[],
): boolean {
  return teams.some((team) => outOfStateNote(team) !== null)
}

/** The line under a list of schools that tells what the mark means. */
export const OUT_OF_STATE_LEGEND = `Marks a school with ${OUT_OF_STATE_MARK_AT} or more games against out-of-state teams this season. Those games do not count toward its rating.`
