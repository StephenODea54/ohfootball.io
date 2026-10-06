import {
  FINAL_DAYS,
  gameStatus,
  OHIO_TIME_ZONE,
  type PickemGame,
  type PickSide,
  type PickStatus,
} from "../src/features/pickem/contract"
import { addDays, dateIn } from "../src/features/pickem/utils/dates"
import { addressKey } from "./address"
import type { Hasher } from "./hash"
import { type ErrorCode, error, json, unavailable } from "./http"
import { type Database, prunePicks, readBoard, removePick, savePick } from "./store"

/** What a handler needs besides the request. runtime.ts makes it from the env of the Function. */
export interface Deps {
  db: Database
  hasher: Hasher
  /** The only origin that may write, such as https://ohfootball.io. */
  origin: string
  now: Date
  loadGames: () => Promise<Map<string, PickemGame>>
  /** Keeps the Function alive until `promise` settles, after the answer is sent. */
  waitUntil: (promise: Promise<unknown>) => void
  /**
   * Whether the old picks are due to be removed. It says yes at most once an hour after a removal
   * that worked, and never while a removal runs.
   */
  pruneDue: () => boolean
  /** Tells whether the removal that pruneDue allowed worked. */
  pruneDone: (worked: boolean) => void
}

/** The largest body of a write, in bytes. A pick needs about 12. */
export const MAX_BODY_BYTES = 1024

/** A game key is a UUID in lower case, as the API writes it. */
const GAME_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const CLOSED: Record<Exclude<PickStatus, "open">, { code: ErrorCode; message: string }> = {
  canceled: { code: "GAME_CANCELED", message: "This game was canceled, so it takes no picks." },
  final: { code: "GAME_FINAL", message: "This game has a result, so it takes no picks." },
  locked: {
    code: "GAME_LOCKED",
    message: "Picks for this game closed at midnight in Ohio after the game day.",
  },
}

/**
 * The first game date that the board shows: ten days before today in Ohio. The Function also
 * removes the picks of each game before this date.
 */
export function cutoff(now: Date): string {
  return addDays(dateIn(now, OHIO_TIME_ZONE), -FINAL_DAYS)
}

function clientKey(request: Request): string | null {
  return addressKey(request.headers.get("CF-Connecting-IP"))
}

/**
 * Whether the write comes from a page of the site. The Origin header must name the site, and so
 * must the address of the request. So a page on ohfootball.pages.dev, which runs the same
 * Function, cannot write.
 */
function fromSite(request: Request, origin: string): boolean {
  return request.headers.get("Origin") === origin && new URL(request.url).origin === origin
}

/** The body as text, or null when it is longer than `limit` bytes. */
async function readLimited(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

/** The side that the body of a PUT names, or the answer that refuses the body. */
async function readSide(request: Request): Promise<PickSide | Response> {
  const type = request.headers.get("Content-Type") ?? ""
  if (!type.toLowerCase().startsWith("application/json")) {
    return error(415, "UNSUPPORTED_MEDIA_TYPE", "Send the pick as application/json.")
  }
  const text = await readLimited(request, MAX_BODY_BYTES)
  if (text === null) {
    return error(413, "BODY_TOO_LARGE", `The body may hold at most ${MAX_BODY_BYTES} bytes.`)
  }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = null
  }
  const side = typeof body === "object" && body !== null ? Reflect.get(body, "side") : undefined
  if (side !== "a" && side !== "b") {
    return error(400, "INVALID_BODY", 'The body must be {"side":"a"} or {"side":"b"}.')
  }
  return side
}

/**
 * Writes the cause of a failure to the log of the Function. The cause comes from D1, from the
 * games file, or from the runtime. It never holds the address, its hash, the secret, or the body
 * of the request, because no step puts them in an error.
 */
function logFailure(what: string, cause: unknown): void {
  console.error(`picks: ${what}`, cause instanceof Error ? (cause.stack ?? cause.message) : cause)
}

/** Starts the removal of old picks when it is due. The answer does not wait for it. */
function prune(deps: Deps): void {
  if (!deps.pruneDue()) return
  deps.waitUntil(
    prunePicks(deps.db, cutoff(deps.now)).then(
      () => deps.pruneDone(true),
      (cause) => {
        logFailure("the removal of old picks failed", cause)
        deps.pruneDone(false)
      },
    ),
  )
}

/** GET /picks/board: the tallies of the games since the cutoff, and the picks of the caller. */
export async function handleBoard(request: Request, deps: Deps): Promise<Response> {
  try {
    const key = clientKey(request)
    const since = cutoff(deps.now)
    const board = await readBoard(deps.db, key ? await deps.hasher(key) : null, since)
    return json({ address: key ? "known" : "unknown", cutoff: since, ...board })
  } catch (cause) {
    logFailure("the board failed", cause)
    return unavailable()
  }
}

/**
 * PUT or DELETE /picks/:gameKey. It checks the origin, the game key, the body of a PUT, the
 * address, the game, and the status of the game, in that order. The first check that fails gives
 * the answer.
 */
async function write(
  request: Request,
  gameKey: string,
  deps: Deps,
  method: "PUT" | "DELETE",
): Promise<Response> {
  try {
    if (!fromSite(request, deps.origin)) {
      return error(403, "ORIGIN_REFUSED", "Picks can be changed only from the site.")
    }
    if (!GAME_KEY.test(gameKey)) {
      return error(400, "INVALID_GAME_KEY", "The game key must be a UUID in lower case.")
    }
    let side: PickSide | null = null
    if (method === "PUT") {
      const read = await readSide(request)
      if (read instanceof Response) return read
      side = read
    }
    const key = clientKey(request)
    if (!key) {
      return error(400, "CLIENT_ADDRESS_UNKNOWN", "The address of the caller is not known.")
    }
    const game = (await deps.loadGames()).get(gameKey)
    if (!game) return error(404, "GAME_UNKNOWN", "No game that takes picks has this key.")
    const status = gameStatus(game, deps.now)
    if (status !== "open") return error(409, CLOSED[status].code, CLOSED[status].message)

    const ipHash = await deps.hasher(key)
    const tally = side
      ? await savePick(deps.db, game, ipHash, side, deps.now)
      : await removePick(deps.db, game, ipHash)
    prune(deps)
    return json({ gameKey, myPick: side, tally })
  } catch (cause) {
    logFailure(`the ${method} of a pick failed`, cause)
    return unavailable()
  }
}

/** PUT /picks/:gameKey with {"side":"a"} or {"side":"b"}: stores or changes the pick. */
export function handlePut(request: Request, gameKey: string, deps: Deps): Promise<Response> {
  return write(request, gameKey, deps, "PUT")
}

/** DELETE /picks/:gameKey: removes the pick of the caller, if there is one. */
export function handleDelete(request: Request, gameKey: string, deps: Deps): Promise<Response> {
  return write(request, gameKey, deps, "DELETE")
}
