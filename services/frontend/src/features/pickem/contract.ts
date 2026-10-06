/**
 * The games file of Pick 'Em. The build writes it to /pickem/games.json. The page reads it in the
 * browser, and the function that stores the picks reads the same file to check each pick. So this
 * file holds only types and rules that both sides share, and imports nothing.
 *
 * Each game has a side a and a side b. The side of a team is fixed for the file, so a pick of
 * side a always means the same team.
 */

export interface PickemTeam {
  /** The key of the team in this season. The team page is /teams/<teamId>. */
  teamId: string
  /** The joeeitel.com number of the school. It names the logo. */
  sourceId: string
  name: string
  isHome: boolean
  /** The rank of the team when the file was written. Null when the team has none. */
  rank: number | null
}

export interface PickemPrediction {
  /** The chance that side a wins, from 0 to 1. */
  aWinProbability: number
  /** The margin the model expects for side a, in points. A negative margin is a loss. */
  aMargin: number
}

export interface PickemResult {
  /** Both teams lose a double forfeit, so it has no winner. */
  winner: "a" | "b" | "tie" | "none"
  aScore: number | null
  bScore: number | null
}

export interface PickemGame {
  /** The key of the game. It is the id of the game in the API. */
  gameKey: string
  season: number
  /** The date of the game, as YYYY-MM-DD. */
  date: string
  /** The week of the season. Weeks run from Wednesday to Tuesday. */
  week: number
  /** The moment picks close: midnight in Ohio at the end of the game day, as an ISO time. */
  lockAt: string
  playoff: boolean
  notes: string | null
  canceled: boolean
  a: PickemTeam
  b: PickemTeam
  prediction: PickemPrediction | null
  result: PickemResult | null
}

export interface PickemGamesFile {
  season: number
  /** The time the build wrote the file, as an ISO time. */
  generatedAt: string
  /** The first and the last game date that the file can hold, as YYYY-MM-DD. */
  window: { from: string; to: string }
  games: PickemGame[]
}

/** How many days after its date a game stays in the file, so the page can show how picks did. */
export const FINAL_DAYS = 10

/** The time zone of Ohio. Game days and the lock of each game follow its clock. */
export const OHIO_TIME_ZONE = "America/New_York"

export type PickSide = "a" | "b"

export type PickStatus = "open" | "locked" | "final" | "canceled"

/** Whether a game takes picks at the moment `now`. A game with a result takes none. */
export function gameStatus(
  game: Pick<PickemGame, "canceled" | "result" | "lockAt">,
  now: Date,
): PickStatus {
  if (game.canceled) return "canceled"
  if (game.result) return "final"
  if (now.getTime() >= Date.parse(game.lockAt)) return "locked"
  return "open"
}
