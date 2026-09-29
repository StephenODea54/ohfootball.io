import { paths } from "@/config/paths"
import type { Game } from "@/types/api"

/** A game with the address of the opponent page, or null when the opponent has no page. */
export type ScheduleGame = Game & { opponentHref: string | null }

/**
 * Gives each game the address of the opponent page. Only schools from Ohio get a page, so a game
 * against a school from another state gets no address. The build knows which pages it draws, so
 * the page passes that list here.
 */
export function linkOpponents(schedule: Game[], pageTeamIds: ReadonlySet<string>): ScheduleGame[] {
  return schedule.map((game) => ({
    ...game,
    opponentHref: pageTeamIds.has(game.opponentId) ? paths.team.getHref(game.opponentId) : null,
  }))
}
