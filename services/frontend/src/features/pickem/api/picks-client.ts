import type { PickSide } from "@/features/pickem/contract"

/**
 * Calls the picks Function from the browser. The Function is on the same origin as the page, so
 * a plain fetch sends what it needs and no cookie is involved.
 *
 * Over the free quota, Cloudflare answers /picks/* with the 404 page of the site. So an answer
 * that is not JSON, or that has no code the page knows, counts as "picks unavailable".
 */

/** The address of the board: the tallies, and the picks of the caller. */
export const PICKS_BOARD = "/picks/board"

/** The address that stores or removes the pick of one game. */
export function pickAddress(gameKey: string): string {
  return `/picks/${encodeURIComponent(gameKey)}`
}

export interface PickTally {
  a: number
  b: number
}

export interface PicksBoard {
  /** "unknown" when the Function cannot read the address of the caller. Then no pick is stored. */
  address: "known" | "unknown"
  /** The first game date that the board holds, as YYYY-MM-DD. */
  cutoff: string
  picks: Record<string, PickSide>
  tallies: Record<string, PickTally>
}

export interface PickWrite {
  gameKey: string
  myPick: PickSide | null
  tally: PickTally
}

/** The code of an answer that the page cannot use. */
export const PICKS_UNAVAILABLE = "PICKS_UNAVAILABLE"

/** A failed call. `code` is the code the Function sent, or PICKS_UNAVAILABLE. */
export class PicksError extends Error {
  readonly code: string

  constructor(code: string, message = "Picks are not available right now.") {
    super(message)
    this.name = "PicksError"
    this.code = code
  }
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isTally(value: unknown): value is PickTally {
  return isRecord(value) && typeof value.a === "number" && typeof value.b === "number"
}

function isBoard(value: unknown): value is PicksBoard {
  return (
    isRecord(value) &&
    (value.address === "known" || value.address === "unknown") &&
    typeof value.cutoff === "string" &&
    isRecord(value.picks) &&
    isRecord(value.tallies)
  )
}

function isWrite(value: unknown): value is PickWrite {
  return (
    isRecord(value) &&
    typeof value.gameKey === "string" &&
    (value.myPick === "a" || value.myPick === "b" || value.myPick === null) &&
    isTally(value.tally)
  )
}

/** The body as JSON, or null when the answer is not JSON. */
async function readJson(response: Response): Promise<unknown> {
  const type = response.headers.get("Content-Type") ?? ""
  if (!type.toLowerCase().startsWith("application/json")) return null
  try {
    return JSON.parse(await response.text())
  } catch {
    return null
  }
}

/** The code of an error answer such as {"error":{"code":"GAME_LOCKED"}}, or null. */
function errorCode(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.error)) return null
  return typeof body.error.code === "string" ? body.error.code : null
}

export function createPicksClient(fetcher: Fetcher = (input, init) => fetch(input, init)) {
  async function call<T>(
    input: string,
    init: RequestInit,
    isValid: (body: unknown) => body is T,
  ): Promise<T> {
    let response: Response
    try {
      response = await fetcher(input, init)
    } catch {
      throw new PicksError(PICKS_UNAVAILABLE)
    }
    const body = await readJson(response)
    if (response.ok && isValid(body)) return body
    const code = response.ok ? null : errorCode(body)
    throw new PicksError(code ?? PICKS_UNAVAILABLE)
  }

  return {
    /** The tallies of the recent games, and the picks of the caller. */
    loadBoard: () => call(PICKS_BOARD, { method: "GET" }, isBoard),
    /** Stores or changes the pick of one game. */
    putPick: (gameKey: string, side: PickSide) =>
      call(
        pickAddress(gameKey),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ side }),
        },
        isWrite,
      ),
    /** Removes the pick of one game, if there is one. */
    removePick: (gameKey: string) => call(pickAddress(gameKey), { method: "DELETE" }, isWrite),
  }
}

export type PicksClient = ReturnType<typeof createPicksClient>
