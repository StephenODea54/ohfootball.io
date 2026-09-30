import type { Game, TeamSummary } from "@/types/api"

/** A game with the joeeitel.com number of the opponent, or null when the site does not know it. */
export type LogoGame<T extends Game> = T & { opponentSourceId: string | null }

/**
 * Gives each game the number of the opponent, so that the schedule can show its logo. The list of
 * teams holds only schools from Ohio, so a school from another state gets null.
 */
export function addOpponentSourceIds<T extends Game>(
  schedule: T[],
  teams: readonly TeamSummary[],
): LogoGame<T>[] {
  const sourceIds = new Map(teams.map((team) => [team.id, team.sourceId]))
  return schedule.map((game) => ({
    ...game,
    opponentSourceId: sourceIds.get(game.opponentId) ?? null,
  }))
}
