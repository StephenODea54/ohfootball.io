import { MAX_BOARD_GAMES } from "@/features/pickem/contract"
import type { TeamPick } from "@/features/pickem/utils/team-picks"

/**
 * The keys of the games that can have a tally, sorted, so the address of the board stays the same.
 * A season has far fewer games than MAX_BOARD_GAMES. If a schedule ever had more, the board would
 * show 0 for the games after the first MAX_BOARD_GAMES, and the Function would not refuse the list.
 */
export function tallyKeys(schedule: readonly { pick: TeamPick | null }[]): string[] {
  return schedule
    .flatMap((game) => (game.pick ? [game.pick.gameKey] : []))
    .sort()
    .slice(0, MAX_BOARD_GAMES)
}
