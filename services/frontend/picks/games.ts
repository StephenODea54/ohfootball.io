import type { PickemFile, PickemFileGame } from "../src/features/pickem/contract"

/** The static files of the deployment. Pages gives them to the Function as env.ASSETS. */
export interface Assets {
  fetch(input: URL | string): Promise<Response>
}

/** The address of the games file. The build writes it from src/pages/pickem/games.json.ts. */
export const GAMES_PATH = "/pickem/games.json"

/** How long an isolate keeps the games file before it reads the file again. */
export const GAMES_TTL_MS = 60_000

const DATE = /^\d{4}-\d{2}-\d{2}$/

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** Whether a game has the fields that the Function reads. */
function isGame(value: unknown): value is PickemFileGame {
  return (
    isObject(value) &&
    typeof value.gameKey === "string" &&
    Number.isInteger(value.season) &&
    typeof value.date === "string" &&
    DATE.test(value.date) &&
    typeof value.lockAt === "string" &&
    !Number.isNaN(Date.parse(value.lockAt)) &&
    typeof value.canceled === "boolean" &&
    (value.result === null || isObject(value.result))
  )
}

/** The games of the file by game key. A file that is not a games file throws. */
export function readGames(file: unknown): Map<string, PickemFileGame> {
  const games = isObject(file) ? (file as Partial<PickemFile>).games : undefined
  if (!Array.isArray(games) || !games.every(isGame)) {
    throw new Error("the games file is not valid")
  }
  return new Map(games.map((game) => [game.gameKey, game]))
}

export type GamesLoader = (
  assets: Assets,
  requestUrl: string,
) => Promise<Map<string, PickemFileGame>>

/**
 * Reads the games file from the deployment and keeps it for GAMES_TTL_MS. A read that fails
 * throws, and nothing is kept, so the next request reads the file again.
 */
export function createGamesLoader(clock: () => number): GamesLoader {
  let kept: { at: number; games: Map<string, PickemFileGame> } | null = null
  return async (assets, requestUrl) => {
    if (kept && clock() - kept.at < GAMES_TTL_MS) return kept.games
    const response = await assets.fetch(new URL(GAMES_PATH, requestUrl))
    if (!response.ok) throw new Error(`the games file answered ${response.status}`)
    const games = readGames(await response.json())
    kept = { at: clock(), games }
    return games
  }
}
