import { addDays, daysBetween } from "@/features/pickem/utils/dates"

/**
 * The week of the season, by the same rule as the API. Weeks run from Wednesday to Tuesday. A week
 * is named by the Monday two days before its Wednesday, as the API names it.
 *
 * Week 1 is the first week that holds at least 50 games between two Ohio teams. A season with no
 * such week starts at the week of its first game. Week N is N - 1 weeks after week 1, and a game
 * before week 1 is in week 1.
 */

/** The fewest games between two Ohio teams that week 1 holds. */
export const SEASON_START_OHIO_GAMES = 50

/** The Monday that names the week of `date`. */
export function weekStart(date: string): string {
  const shifted = addDays(date, -2)
  const [year, month, day] = shifted.split("-").map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return addDays(shifted, -((weekday + 6) % 7))
}

/** One game of the season, for the count of its weeks. */
export interface WeekGame {
  date: string
  /** True when both teams are from Ohio. */
  ohio: boolean
}

/** The Monday that names week 1 of a season, or null when the season has no game. */
export function seasonStart(games: readonly WeekGame[]): string | null {
  const ohioGames = new Map<string, number>()
  for (const game of games) {
    const start = weekStart(game.date)
    ohioGames.set(start, (ohioGames.get(start) ?? 0) + (game.ohio ? 1 : 0))
  }
  const starts = [...ohioGames.keys()].sort()
  return (
    starts.find((start) => (ohioGames.get(start) ?? 0) >= SEASON_START_OHIO_GAMES) ??
    starts[0] ??
    null
  )
}

/** The number of the week of `date`, in a season whose week 1 is named by `start`. */
export function weekNumber(date: string, start: string): number {
  return Math.max(1, daysBetween(start, weekStart(date)) / 7 + 1)
}
