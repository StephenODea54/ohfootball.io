import type { Game, TeamRating, TeamSummary } from "@/types/api"

/** The rank and rating of an opponent. */
export type OpponentStanding = Pick<TeamRating, "rank" | "value">

/** A game with the current standing of the opponent, or null when the opponent has no rating. */
export type StandingGame<T extends Game> = T & { opponentStanding: OpponentStanding | null }

/**
 * Gives each game the current rank and rating of the opponent, the same values the leaderboard
 * shows. The prediction of a game holds the rating from the day of the prediction, so the two can
 * differ. A school from another state and a school without a rating get null. The list of teams is
 * best rated first, so when an id occurs two times, the first entry is kept.
 */
export function addOpponentStandings<T extends Game>(
  schedule: T[],
  teams: readonly TeamSummary[],
): StandingGame<T>[] {
  const standings = new Map<string, OpponentStanding>()
  for (const team of teams) {
    if (team.rating && !standings.has(team.id)) {
      standings.set(team.id, { rank: team.rating.rank, value: team.rating.value })
    }
  }

  return schedule.map((game) => ({
    ...game,
    opponentStanding: standings.get(game.opponentId) ?? null,
  }))
}
