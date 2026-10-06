import {
  OHIO_TIME_ZONE,
  type PickemGame,
  type PickemGamesFile,
} from "../../src/features/pickem/contract"
import { lockAt } from "../../src/features/pickem/utils/dates"
import type { Env } from "../env"
import type { Assets } from "../games"
import type { Context } from "../runtime"
import { SqliteD1 } from "./sqlite-d1"

export const ORIGIN = "https://ohfootball.io"
export const SECRET = "s".repeat(32)

/** Tuesday 6 October 2026, at noon in Ohio. The cutoff of the board is 26 September. */
export const NOW = Date.parse("2026-10-06T16:00:00Z")

export const OPEN = "00000000-0000-4000-8000-000000000001"
export const LOCKED = "00000000-0000-4000-8000-000000000002"
export const FINAL = "00000000-0000-4000-8000-000000000003"
export const CANCELED = "00000000-0000-4000-8000-000000000004"
export const OLD = "00000000-0000-4000-8000-000000000005"
export const MISSING = "00000000-0000-4000-8000-0000000000ff"

/** The moment the picks of OPEN close: midnight in Ohio after Friday 9 October. */
export const OPEN_LOCK = Date.parse("2026-10-10T04:00:00.000Z")

function game(gameKey: string, date: string, extra: Partial<PickemGame> = {}): PickemGame {
  const team = { teamId: "t", sourceId: "1", name: "T", isHome: true, rank: null }
  return {
    gameKey,
    season: 2026,
    date,
    week: 7,
    lockAt: lockAt(date, OHIO_TIME_ZONE),
    playoff: false,
    notes: null,
    canceled: false,
    a: team,
    b: { ...team, sourceId: "2", isHome: false },
    prediction: null,
    result: null,
    ...extra,
  }
}

export function gamesFile(): PickemGamesFile {
  return {
    season: 2026,
    generatedAt: "2026-10-05T12:00:00.000Z",
    window: { from: "2026-09-25", to: "2026-10-20" },
    games: [
      game(OPEN, "2026-10-09"),
      game(LOCKED, "2026-10-02"),
      game(FINAL, "2026-10-02", { result: { winner: "a", aScore: 21, bScore: 7 } }),
      game(CANCELED, "2026-10-09", { canceled: true }),
      game(OLD, "2026-09-20"),
    ],
  }
}

/** The static files of a deployment that serves `body` as the games file. */
export function assetsWith(body: () => Response): Assets & { urls: string[] } {
  const urls: string[] = []
  return {
    urls,
    async fetch(input) {
      urls.push(String(input))
      return body()
    },
  }
}

export function jsonFile(file: unknown = gamesFile()): Response {
  return new Response(JSON.stringify(file), { headers: { "Content-Type": "application/json" } })
}

export function testEnv(overrides: Partial<Env> = {}): Env & { PICKS_DB: SqliteD1 } {
  return {
    PICKS_DB: new SqliteD1(),
    PICKS_HASH_SECRET: SECRET,
    PICKS_ORIGIN: ORIGIN,
    ASSETS: assetsWith(() => jsonFile()),
    ...overrides,
  } as Env & { PICKS_DB: SqliteD1 }
}

export interface RequestOptions {
  method?: string
  ip?: string | null
  origin?: string | null
  url?: string
  type?: string | null
  body?: string | null
}

export function request(path: string, options: RequestOptions = {}): Request {
  const headers = new Headers()
  const ip = options.ip === undefined ? "203.0.113.7" : options.ip
  const origin = options.origin === undefined ? ORIGIN : options.origin
  const type = options.type === undefined ? "application/json" : options.type
  if (ip !== null) headers.set("CF-Connecting-IP", ip)
  if (origin !== null) headers.set("Origin", origin)
  if (type !== null) headers.set("Content-Type", type)
  return new Request(new URL(path, options.url ?? ORIGIN), {
    method: options.method ?? "GET",
    headers,
    body: options.body ?? null,
  })
}

export function context(
  req: Request,
  env: Env,
  params: Record<string, string | string[]> = {},
): Context & { waits: Promise<unknown>[] } {
  const waits: Promise<unknown>[] = []
  return { request: req, env, params, waits, waitUntil: (promise) => waits.push(promise) }
}
