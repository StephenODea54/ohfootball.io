import {
  FINAL_DAYS,
  OHIO_TIME_ZONE,
  type PickemGame,
  type PickemGamesFile,
  type PickemResult,
} from "@/features/pickem/contract"
import { addDays, dateIn, lockAt } from "@/features/pickem/utils/dates"
import type { Game, Team, TeamSummary } from "@/types/api"

/**
 * The first and the last game date of the games. They are the games of the last ten days, and every
 * game after them up to `lastGame`, the last game date that the build read. With no later game, the
 * window ends where it starts.
 */
export function pickWindow(today: string, lastGame: string | null): { from: string; to: string } {
  const from = addDays(today, -FINAL_DAYS)
  return { from, to: lastGame && lastGame > from ? lastGame : from }
}

/** The result of a game, turned to side a. Null when the game has no result yet. */
export function pickResult(game: Game, teamIsA: boolean): PickemResult | null {
  // Both schedules record a loss for a double forfeit, the same rule as the rating reads.
  if (game.notes?.trim().toLowerCase() === "double forfeit") return { winner: "none" }
  if (game.result === "TIE") return { winner: "tie" }
  if (game.result !== "WIN" && game.result !== "LOSS") return null
  const teamWon = game.result === "WIN"
  return { winner: teamWon === teamIsA ? "a" : "b" }
}

/**
 * One game seen from the schedule of `team`, turned so that side a is the school whose number
 * comes first as text. The order only has to stay the same within one build, so a reader takes the
 * sides from the games and never works them out again.
 */
function toPickemGame(
  game: Game,
  team: TeamSummary,
  opponent: TeamSummary,
  season: number,
): PickemGame {
  const teamIsA = team.sourceId < opponent.sourceId
  return {
    gameKey: game.id,
    season,
    date: game.date,
    lockAt: lockAt(game.date, OHIO_TIME_ZONE),
    canceled: game.result === "CANCELED",
    a: { teamId: teamIsA ? team.id : opponent.id },
    b: { teamId: teamIsA ? opponent.id : team.id },
    result: pickResult(game, teamIsA),
  }
}

/**
 * The games of Pick 'Em. `teams` are the teams the build read in full, with their schedules.
 * `allTeams` is the list of the season, which holds only schools from Ohio. A game is in the games
 * when both of its teams were read in full, so a short build on a laptop stays consistent with its
 * pages. The two schedules of one game hold the same game key, and the game is kept once.
 */
export function pickableGames(
  teams: readonly Team[],
  allTeams: readonly TeamSummary[],
  season: number,
  now: Date,
): PickemGamesFile {
  const ohio = new Map(allTeams.map((team) => [team.id, team]))
  const read = new Set(teams.map((team) => team.id))

  const seen = new Set<string>()
  let lastGame: string | null = null
  const candidates: { game: Game; team: TeamSummary; opponent: TeamSummary }[] = []
  for (const team of teams) {
    for (const game of team.schedule) {
      if (seen.has(game.id)) continue
      seen.add(game.id)
      if (lastGame === null || game.date > lastGame) lastGame = game.date
      const opponent = ohio.get(game.opponentId)
      if (opponent && read.has(opponent.id)) candidates.push({ game, team, opponent })
    }
  }

  const window = pickWindow(dateIn(now, OHIO_TIME_ZONE), lastGame)
  const games = candidates
    .filter(({ game }) => game.date >= window.from)
    .map(({ game, team, opponent }) => toPickemGame(game, team, opponent, season))
    .sort((x, y) => x.date.localeCompare(y.date) || x.gameKey.localeCompare(y.gameKey))

  return { season, generatedAt: now.toISOString(), window, games }
}
