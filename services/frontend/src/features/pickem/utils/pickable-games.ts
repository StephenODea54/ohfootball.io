import type {
  PickemGame,
  PickemGamesFile,
  PickemResult,
  PickemTeam,
} from "@/features/pickem/contract"
import { addDays, dateIn, lockAt } from "@/features/pickem/utils/dates"
import { seasonStart, type WeekGame, weekNumber, weekStart } from "@/features/pickem/utils/week"
import type { Game, Team, TeamSummary } from "@/types/api"

/** How many days after its date a game stays in the file, so the page can show how picks did. */
export const FINAL_DAYS = 10

/** The time zone of Ohio. Game days and the lock of each game follow its clock. */
export const OHIO_TIME_ZONE = "America/New_York"

/**
 * The first and the last game date of the file. It holds the games of the last ten days, and the
 * games up to the end of the week after this one. Weeks end on a Tuesday.
 */
export function pickWindow(today: string): { from: string; to: string } {
  return { from: addDays(today, -FINAL_DAYS), to: addDays(weekStart(today), 15) }
}

function side(team: TeamSummary, isHome: boolean): PickemTeam {
  return {
    teamId: team.id,
    sourceId: team.sourceId,
    name: team.name,
    isHome,
    rank: team.rating?.rank ?? null,
  }
}

function result(game: Game, teamIsA: boolean): PickemResult | null {
  const [aScore, bScore] = teamIsA
    ? [game.teamScore, game.opponentScore]
    : [game.opponentScore, game.teamScore]
  // Both schedules record a loss for a double forfeit, the same rule as the rating reads.
  if (game.notes?.trim().toLowerCase() === "double forfeit") {
    return { winner: "none", aScore, bScore }
  }
  if (game.result === "TIE") return { winner: "tie", aScore, bScore }
  if (game.result !== "WIN" && game.result !== "LOSS") return null
  const teamWon = game.result === "WIN"
  return { winner: teamWon === teamIsA ? "a" : "b", aScore, bScore }
}

/**
 * One game seen from the schedule of `team`, turned so that side a is the school whose number
 * comes first as text. The order only has to stay the same within one file, so a reader takes the
 * sides from the file and never works them out again.
 */
function toPickemGame(
  game: Game,
  team: TeamSummary,
  opponent: TeamSummary,
  season: number,
  week: number,
): PickemGame {
  const teamIsA = team.sourceId < opponent.sourceId
  const teamSide = side(team, game.location === "HOME")
  const opponentSide = side(opponent, game.location === "AWAY")
  const prediction = game.prediction
  return {
    gameKey: game.id,
    season,
    date: game.date,
    week,
    lockAt: lockAt(game.date, OHIO_TIME_ZONE),
    playoff: game.playoff,
    notes: game.notes,
    canceled: game.result === "CANCELED",
    a: teamIsA ? teamSide : opponentSide,
    b: teamIsA ? opponentSide : teamSide,
    prediction: prediction && {
      aWinProbability: teamIsA ? prediction.winProbability : 1 - prediction.winProbability,
      aMargin: teamIsA ? prediction.predictedMargin : -prediction.predictedMargin,
    },
    result: result(game, teamIsA),
  }
}

/**
 * The games file. `teams` are the teams the build read in full, with their schedules. `allTeams`
 * is the list of the season, which holds only schools from Ohio. A game is in the file when both
 * of its teams were read in full, so a short build on a laptop stays consistent with its pages.
 * The two schedules of one game hold the same game key, and the game is kept once.
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
  const weekGames: WeekGame[] = []
  const candidates: { game: Game; team: TeamSummary; opponent: TeamSummary }[] = []
  for (const team of teams) {
    for (const game of team.schedule) {
      if (seen.has(game.id)) continue
      seen.add(game.id)
      const opponent = ohio.get(game.opponentId)
      weekGames.push({ date: game.date, ohio: opponent !== undefined })
      if (opponent && read.has(opponent.id)) candidates.push({ game, team, opponent })
    }
  }

  const window = pickWindow(dateIn(now, OHIO_TIME_ZONE))
  const start = seasonStart(weekGames)
  if (start === null) return { season, generatedAt: now.toISOString(), window, games: [] }

  const games = candidates
    .filter(({ game }) => game.date >= window.from && game.date <= window.to)
    .map(({ game, team, opponent }) =>
      toPickemGame(game, team, opponent, season, weekNumber(game.date, start)),
    )
    .sort((x, y) => x.date.localeCompare(y.date) || x.gameKey.localeCompare(y.gameKey))

  return { season, generatedAt: now.toISOString(), window, games }
}
