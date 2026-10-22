import type { Game } from "@/types/api"

/** The number of playoff rounds inside a region. Round 4 is the regional final. */
export const REGION_ROUNDS = 4

const MS_PER_DAY = 86_400_000

/** The day of a date such as 2026-10-30, counted from 1970-01-01. It ignores the time zone. */
export function dayNumber(date: string) {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number)
  return Date.UTC(year, month - 1, day) / MS_PER_DAY
}

/**
 * The day of the Wednesday on or before a day. A football week runs from Wednesday to Tuesday, so
 * a game on Thursday, Friday, Saturday, or a late Monday is in one week.
 */
export function weekStart(day: number) {
  // 1970-01-01 was a Thursday. 0 is Sunday, so a Wednesday is 3.
  const weekday = (((day + 4) % 7) + 7) % 7
  return day - ((weekday + 4) % 7)
}

/** The schedule of a team, as the build loaded it. */
export type Schedules = ReadonlyMap<string, readonly Game[]>

/**
 * The week of the first playoff round: the week with the most playoff games. Each round has half
 * the games of the round before it, so one game with a wrong playoff mark cannot move the first
 * round. Null when the schedules have no playoff game.
 */
export function firstRoundWeek(schedules: Schedules): number | null {
  const games = new Map<string, number>()
  for (const schedule of schedules.values()) {
    for (const game of schedule) {
      if (game.playoff && game.result !== "CANCELED") {
        games.set(game.id, weekStart(dayNumber(game.date)))
      }
    }
  }
  const counts = new Map<number, number>()
  for (const week of games.values()) counts.set(week, (counts.get(week) ?? 0) + 1)
  let best: number | null = null
  for (const [week, count] of counts) {
    const most = best === null ? 0 : (counts.get(best) as number)
    if (count > most || (count === most && week < (best as number))) best = week
  }
  return best
}

/** A playoff game between two teams of a region, as the schedules of the teams show it. */
export interface BracketGame {
  id: string
  round: number
  /** The day of the game, such as 2026-10-30. */
  date: string
  teamIds: [string, string]
  /** Null when neither schedule puts a team at home. */
  homeId: string | null
  /** Null while the game has no result, and for a game that both teams lost. */
  winnerId: string | null
  loserId: string | null
}

/**
 * The playoff games of a region in rounds 1 to 4, from the schedules of its teams. A game counts
 * when both teams are in the list. Each team shows the game in its own schedule, so a game can
 * come two times. A win of either team decides it. A loss decides it only when the other team did
 * not lose it too, because both teams lose a double forfeit. A tie, a canceled game, and a game
 * with no result decide nothing.
 */
export function regionGames(
  teamIds: readonly string[],
  schedules: Schedules,
  firstWeek: number,
): BracketGame[] {
  const inRegion = new Set(teamIds)
  const views = new Map<string, { teamId: string; game: Game }[]>()
  for (const teamId of teamIds) {
    for (const game of schedules.get(teamId) ?? []) {
      if (!game.playoff || game.result === "CANCELED" || !inRegion.has(game.opponentId)) continue
      views.set(game.id, [...(views.get(game.id) ?? []), { teamId, game }])
    }
  }

  return [...views.entries()]
    .map(([id, sides]): BracketGame => {
      const { teamId, game } = sides[0]
      const round = (weekStart(dayNumber(game.date)) - firstWeek) / 7 + 1
      const win = sides.find((side) => side.game.result === "WIN")
      const losses = sides.filter((side) => side.game.result === "LOSS")
      const winnerId = win ? win.teamId : losses.length === 1 ? losses[0].game.opponentId : null
      const home = sides.find((side) => side.game.location !== "NEUTRAL")
      const homeId = home
        ? home.game.location === "HOME"
          ? home.teamId
          : home.game.opponentId
        : null
      return {
        id,
        round,
        date: game.date.slice(0, 10),
        teamIds: [teamId, game.opponentId],
        homeId,
        winnerId,
        loserId: winnerId === null ? null : winnerId === teamId ? game.opponentId : teamId,
      }
    })
    .filter((game) => game.round >= 1 && game.round <= REGION_ROUNDS)
    .sort(
      (first, second) =>
        first.round - second.round ||
        first.date.localeCompare(second.date) ||
        first.id.localeCompare(second.id),
    )
}
