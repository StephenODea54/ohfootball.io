/**
 * The responses of the picks Function. Each answer is JSON that no cache keeps.
 *
 * The `_headers` file of the site does not apply to an answer of a Function, so each answer sets
 * its own headers here.
 *
 * The site must never send `Referrer-Policy: no-referrer`. With that policy, a browser sends
 * `Origin: null` with a write, and the Function refuses every write whose Origin is not the site.
 */

export type ErrorCode =
  | "ORIGIN_REFUSED"
  | "INVALID_GAME_KEY"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "BODY_TOO_LARGE"
  | "INVALID_BODY"
  | "CLIENT_ADDRESS_UNKNOWN"
  | "GAME_UNKNOWN"
  | "GAME_CANCELED"
  | "GAME_FINAL"
  | "GAME_LOCKED"
  | "METHOD_NOT_ALLOWED"
  | "PICKS_UNAVAILABLE"

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...headers } })
}

export function error(
  status: number,
  code: ErrorCode,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return json({ error: { code, message } }, status, headers)
}

/** The answer when the database, the secret, the origin, or the games file is not there. */
export function unavailable(): Response {
  return error(503, "PICKS_UNAVAILABLE", "Picks are not available now. Try again later.")
}

/** The answer to a method that the address does not take. `allow` lists the methods it takes. */
export function methodNotAllowed(allow: string): Response {
  return error(405, "METHOD_NOT_ALLOWED", `This address takes only ${allow}.`, { Allow: allow })
}
