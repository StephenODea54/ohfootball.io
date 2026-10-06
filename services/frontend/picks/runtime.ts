import type { Env } from "./env"
import { createGamesLoader } from "./games"
import { type Deps, handleBoard, handleDelete, handlePut } from "./handlers"
import { hasherCache } from "./hash"
import { unavailable } from "./http"

/** The part of the context of a Pages Function that the picks Function reads. */
export interface Context {
  request: Request
  env: Env
  params?: Record<string, string | string[] | undefined>
  waitUntil(promise: Promise<unknown>): void
}

/** The Function removes old picks at most once in this time, in each isolate. */
export const PRUNE_INTERVAL_MS = 60 * 60 * 1000

/** The origin of `value`, such as https://ohfootball.io, or null when it is not an http(s) URL. */
export function originOf(value: string | undefined): string | null {
  if (!value) return null
  try {
    const { origin, protocol } = new URL(value)
    return protocol === "https:" || protocol === "http:" ? origin : null
  } catch {
    return null
  }
}

/**
 * The handlers of the picks Function, with the state that an isolate keeps between requests: the
 * hash key, the origin, the games file, and the time of the last removal of old picks that worked.
 * `clock` gives the time in milliseconds, so a test can move it.
 */
export function createRuntime(clock: () => number = Date.now) {
  const hasherFor = hasherCache()
  const loadGames = createGamesLoader(clock)
  let kept: { value: string | undefined; origin: string | null } | null = null
  let prunedAt = Number.NEGATIVE_INFINITY
  let pruning = false

  /** The setting PICKS_ORIGIN as an origin. It is read again only when the setting changes. */
  const originFor = (value: string | undefined) => {
    if (!kept || kept.value !== value) kept = { value, origin: originOf(value) }
    return kept.origin
  }

  const pruneDue = () => {
    if (pruning || clock() - prunedAt < PRUNE_INTERVAL_MS) return false
    pruning = true
    return true
  }

  const pruneDone = (worked: boolean) => {
    pruning = false
    if (worked) prunedAt = clock()
  }

  /** What the handlers need, or null when a binding or a setting is missing. */
  function deps(context: Context): Deps | null {
    const { env, request } = context
    const hasher = hasherFor(env.PICKS_HASH_SECRET)
    const site = originFor(env.PICKS_ORIGIN)
    if (!env.PICKS_DB || !site || !hasher) return null
    return {
      db: env.PICKS_DB,
      hasher,
      origin: site,
      now: new Date(clock()),
      loadGames: () => loadGames(env.ASSETS, request.url),
      waitUntil: (promise) => context.waitUntil(promise),
      pruneDue,
      pruneDone,
    }
  }

  function gameKey(context: Context): string {
    const value = context.params?.gameKey
    return typeof value === "string" ? value : ""
  }

  return {
    /** GET or HEAD /picks/board. A HEAD gets the status and the headers of a GET, with no body. */
    board: async (context: Context): Promise<Response> => {
      const found = deps(context)
      const response = found ? await handleBoard(context.request, found) : unavailable()
      if (context.request.method !== "HEAD") return response
      return new Response(null, { status: response.status, headers: response.headers })
    },
    put: async (context: Context): Promise<Response> => {
      const found = deps(context)
      return found ? handlePut(context.request, gameKey(context), found) : unavailable()
    },
    remove: async (context: Context): Promise<Response> => {
      const found = deps(context)
      return found ? handleDelete(context.request, gameKey(context), found) : unavailable()
    },
  }
}

/** The runtime that the files under functions/ share. */
export const picks = createRuntime()
