/**
 * The games of Pick 'Em. The build makes them once from the schedules, and each team page draws its
 * picks from them. The build also writes a short games file to /pickem/games.json, which the
 * function that stores the picks reads to check each pick. So this file holds only types and rules
 * that the site and the function share, and imports nothing.
 *
 * Each game has a side a and a side b. The side of a team is fixed for the build, so a pick of
 * side a always means the same team.
 */

export interface PickemTeam {
  /** The key of the team in this season. The team page is /teams/<teamId>. */
  teamId: string
}

export interface PickemResult {
  /** Both teams lose a double forfeit, so it has no winner. */
  winner: "a" | "b" | "tie" | "none"
}

/** One game of the games file at /pickem/games.json: only what the picks Function reads. */
export interface PickemFileGame {
  /** The key of the game. It is the id of the game in the API. */
  gameKey: string
  season: number
  /** The date of the game, as YYYY-MM-DD. */
  date: string
  /** The moment picks close: midnight in Ohio at the end of the game day, as an ISO time. */
  lockAt: string
  canceled: boolean
  result: PickemResult | null
}

/** One game of the build, with the side of each team. It stays in the memory of the build. */
export interface PickemGame extends PickemFileGame {
  a: PickemTeam
  b: PickemTeam
}

interface Games<T> {
  season: number
  /** The time the build made the games, as an ISO time. */
  generatedAt: string
  /** The first game date, and the last game date that the build read, as YYYY-MM-DD. */
  window: { from: string; to: string }
  games: T[]
}

/** The games of the build. The team pages read them in the memory of the build. */
export type PickemGamesFile = Games<PickemGame>

/** The games file at /pickem/games.json. Only the picks Function reads it. */
export type PickemFile = Games<PickemFileGame>

/** The games file from the games of the build: each game without its sides. */
export function toPickemFile(file: PickemGamesFile): PickemFile {
  return {
    ...file,
    games: file.games.map(({ a: _a, b: _b, ...game }) => game),
  }
}

/** How many days after its date a game stays in the games, so the page can show how picks did. */
export const FINAL_DAYS = 10

/** The time zone of Ohio. Game days and the lock of each game follow its clock. */
export const OHIO_TIME_ZONE = "America/New_York"

export type PickSide = "a" | "b"

/** The side that is not `side`. */
export function otherSide(side: PickSide): PickSide {
  return side === "a" ? "b" : "a"
}

/**
 * The most game keys that one board can ask for. The Function binds each key as one parameter, and
 * D1 takes at most 100 for each statement.
 */
export const MAX_BOARD_GAMES = 40

export type PickStatus = "open" | "locked" | "final" | "canceled"

/** Whether a game takes picks at the moment `now`. A game with a result takes none. */
export function gameStatus(
  game: Pick<PickemFileGame, "canceled" | "result" | "lockAt">,
  now: Date,
): PickStatus {
  if (game.canceled) return "canceled"
  if (game.result) return "final"
  if (now.getTime() >= Date.parse(game.lockAt)) return "locked"
  return "open"
}
