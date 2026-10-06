import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest"
import type { Env } from "./env"
import { createHasher } from "./hash"
import { createRuntime, originOf, PRUNE_INTERVAL_MS } from "./runtime"
import {
  assetsWith,
  CANCELED,
  context,
  FINAL,
  jsonFile,
  LOCKED,
  MISSING,
  NOW,
  OLD,
  OPEN,
  OPEN_LOCK,
  ORIGIN,
  type RequestOptions,
  request,
  SECRET,
  testEnv,
} from "./test/fixtures"

let time: number
let runtime: ReturnType<typeof createRuntime>
let env: ReturnType<typeof testEnv>
let logged: MockInstance<typeof console.error>

beforeEach(() => {
  time = NOW
  runtime = createRuntime(() => time)
  env = testEnv()
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  logged.mockRestore()
})

/** Everything the Function wrote to its log, as one text. */
function log(): string {
  return logged.mock.calls.map((call) => call.map(String).join(" ")).join("\n")
}

/**
 * Makes the statement that removes old picks answer with `result` instead of running. The other
 * statements run as before.
 */
function holdPrune(result: () => Promise<unknown>): () => void {
  const db = env.PICKS_DB
  const prepare = db.prepare
  db.prepare = (sql) => {
    const statement = prepare.call(db, sql)
    if (!sql.startsWith("DELETE FROM picks WHERE game_date")) return statement
    const bind = statement.bind.bind(statement)
    statement.bind = (...values) => {
      const bound = bind(...values)
      bound.run = result
      return bound
    }
    return statement
  }
  return () => {
    db.prepare = prepare
  }
}

function board(options: RequestOptions = {}, on: Env = env) {
  return runtime.board(context(request("/picks/board", options), on))
}

function put(gameKey: string, side: unknown, options: RequestOptions = {}, on: Env = env) {
  const body = options.body !== undefined ? options.body : JSON.stringify({ side })
  const req = request(`/picks/${gameKey}`, { method: "PUT", ...options, body })
  return runtime.put(context(req, on, { gameKey }))
}

function remove(gameKey: string, options: RequestOptions = {}, on: Env = env) {
  const req = request(`/picks/${gameKey}`, { method: "DELETE", type: null, ...options })
  return runtime.remove(context(req, on, { gameKey }))
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status)
  expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8")
  expect(response.headers.get("Cache-Control")).toBe("no-store")
  const body = await response.json()
  expect(body.error.code).toBe(code)
  expect(typeof body.error.message).toBe("string")
}

describe("the board", () => {
  it("is empty before any pick", async () => {
    const response = await board()

    expect(response.status).toBe(200)
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(await response.json()).toEqual({
      address: "known",
      cutoff: "2026-09-26",
      picks: {},
      tallies: {},
    })
  })

  it("shows the picks of the caller and the tallies of every caller", async () => {
    await put(OPEN, "a")
    await put(OPEN, "b", { ip: "198.51.100.1" })
    await put(LOCKED, "a", { ip: "198.51.100.1" })

    const body = await (await board()).json()

    expect(body.picks).toEqual({ [OPEN]: "a" })
    expect(body.tallies).toEqual({ [OPEN]: { a: 1, b: 1 } })
  })

  it("leaves out the games before the cutoff", async () => {
    env.PICKS_DB.query(
      "INSERT INTO tallies (game_key, season, game_date, a, b) VALUES (?, 2026, ?, 3, 4)",
      OLD,
      "2026-09-25",
    )
    env.PICKS_DB.query(
      "INSERT INTO tallies (game_key, season, game_date, a, b) VALUES (?, 2026, ?, 1, 2)",
      LOCKED,
      "2026-09-26",
    )

    const body = await (await board()).json()

    expect(body.tallies).toEqual({ [LOCKED]: { a: 1, b: 2 } })
  })

  it("shows the tallies and no picks to a caller with no address", async () => {
    await put(OPEN, "a")

    const body = await (await board({ ip: null })).json()

    expect(body).toEqual({
      address: "unknown",
      cutoff: "2026-09-26",
      picks: {},
      tallies: { [OPEN]: { a: 1, b: 0 } },
    })
  })

  it("treats an address it cannot read as unknown", async () => {
    const body = await (await board({ ip: "not an address" })).json()

    expect(body.address).toBe("unknown")
  })

  it("moves the cutoff with the day in Ohio", async () => {
    // 03:59 UTC on 7 October is still 6 October in Ohio.
    time = Date.parse("2026-10-07T03:59:00Z")
    expect((await (await board()).json()).cutoff).toBe("2026-09-26")

    time = Date.parse("2026-10-07T04:00:00Z")
    expect((await (await board()).json()).cutoff).toBe("2026-09-27")
  })

  it("needs no origin", async () => {
    expect((await board({ origin: null })).status).toBe(200)
  })
})

describe("a pick", () => {
  it("is stored and counted", async () => {
    const response = await put(OPEN, "a")

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(await response.json()).toEqual({ gameKey: OPEN, myPick: "a", tally: { a: 1, b: 0 } })
    const [row] = env.PICKS_DB.query<Record<string, unknown>>("SELECT * FROM picks")
    expect(row).toMatchObject({ game_key: OPEN, side: "a", season: 2026, game_date: "2026-10-09" })
    expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(row)).not.toContain("203.0.113.7")
    expect(row.created_at).toBe(new Date(NOW).toISOString())
  })

  it("changes the tally when it is changed", async () => {
    await put(OPEN, "a")
    time += 1000

    const response = await put(OPEN, "b")

    expect(await response.json()).toEqual({ gameKey: OPEN, myPick: "b", tally: { a: 0, b: 1 } })
    const rows = env.PICKS_DB.query<Record<string, unknown>>("SELECT * FROM picks")
    expect(rows).toHaveLength(1)
    expect(rows[0].created_at).toBe(new Date(NOW).toISOString())
    expect(rows[0].updated_at).toBe(new Date(NOW + 1000).toISOString())
  })

  it("writes nothing when the same side is picked again", async () => {
    await put(OPEN, "a")
    await put(OPEN, "b", { ip: "198.51.100.1" })
    time += 1000
    const batch = vi.spyOn(env.PICKS_DB, "batch")

    const response = await put(OPEN, "a")

    expect(await response.json()).toEqual({ gameKey: OPEN, myPick: "a", tally: { a: 1, b: 1 } })
    expect(batch).toHaveBeenCalledTimes(1)
    const rows = env.PICKS_DB.query<Record<string, unknown>>(
      "SELECT updated_at FROM picks WHERE side = 'a'",
    )
    expect(rows).toEqual([{ updated_at: new Date(NOW).toISOString() }])
  })

  it("counts again when the same side is picked and the game has no tally", async () => {
    await put(OPEN, "a")
    env.PICKS_DB.query("DELETE FROM tallies")

    expect((await (await put(OPEN, "a")).json()).tally).toEqual({ a: 1, b: 0 })
  })

  it("counts two addresses apart", async () => {
    await put(OPEN, "a")

    const response = await put(OPEN, "a", { ip: "2001:db8::1" })

    expect((await response.json()).tally).toEqual({ a: 2, b: 0 })
  })

  it("gives one pick to each IPv6 /64", async () => {
    await put(OPEN, "a", { ip: "2001:db8:1:2::1" })

    const response = await put(OPEN, "b", { ip: "2001:db8:1:2:ffff::9" })

    expect((await response.json()).tally).toEqual({ a: 0, b: 1 })
    const body = await (await board({ ip: "2001:0db8:0001:0002::5" })).json()
    expect(body.picks).toEqual({ [OPEN]: "b" })
  })

  it("gives an IPv4 address in IPv6 form the pick of the IPv4 address", async () => {
    await put(OPEN, "a", { ip: "203.0.113.7" })

    const response = await put(OPEN, "b", { ip: "::ffff:203.0.113.7" })

    expect((await response.json()).tally).toEqual({ a: 0, b: 1 })
  })

  it("is open until the moment it locks", async () => {
    time = OPEN_LOCK - 1
    expect((await put(OPEN, "a")).status).toBe(200)

    time = OPEN_LOCK
    await expectError(await put(OPEN, "b"), 409, "GAME_LOCKED")
    await expectError(await remove(OPEN), 409, "GAME_LOCKED")
  })

  it("is refused for a game that is locked, final, or canceled", async () => {
    await expectError(await put(LOCKED, "a"), 409, "GAME_LOCKED")
    await expectError(await put(FINAL, "a"), 409, "GAME_FINAL")
    await expectError(await put(CANCELED, "a"), 409, "GAME_CANCELED")
    expect(env.PICKS_DB.query("SELECT * FROM picks")).toEqual([])
  })

  it("is refused for a game that is not in the file", async () => {
    await expectError(await put(MISSING, "a"), 404, "GAME_UNKNOWN")
  })

  it("is refused for a game key that is not a UUID in lower case", async () => {
    await expectError(await put("not-a-key", "a"), 400, "INVALID_GAME_KEY")
    await expectError(await put(MISSING.toUpperCase(), "a"), 400, "INVALID_GAME_KEY")
    await expectError(await remove("x"), 400, "INVALID_GAME_KEY")
  })

  it("is refused when the route gives no game key", async () => {
    const req = request(`/picks/${OPEN}`, { method: "PUT", body: '{"side":"a"}' })

    await expectError(
      await runtime.put(context(req, env, { gameKey: [OPEN] })),
      400,
      "INVALID_GAME_KEY",
    )
  })

  it("is refused from another origin", async () => {
    await expectError(
      await put(OPEN, "a", { origin: "https://evil.example" }),
      403,
      "ORIGIN_REFUSED",
    )
    await expectError(await put(OPEN, "a", { origin: null }), 403, "ORIGIN_REFUSED")
    await expectError(await put(OPEN, "a", { origin: "null" }), 403, "ORIGIN_REFUSED")
    await expectError(await remove(OPEN, { origin: null }), 403, "ORIGIN_REFUSED")
  })

  it("is refused when the Origin header ends with a slash", async () => {
    await expectError(await put(OPEN, "a", { origin: `${ORIGIN}/` }), 403, "ORIGIN_REFUSED")
  })

  it("reads the setting of the origin as an origin", async () => {
    for (const setting of [`${ORIGIN}/`, "https://OHFOOTBALL.IO", `${ORIGIN}/pickem`]) {
      env.PICKS_ORIGIN = setting
      expect((await put(OPEN, "a")).status).toBe(200)
    }
  })

  it("is refused on pages.dev, even with the Origin of the site", async () => {
    const options = { url: "https://ohfootball.pages.dev" }

    await expectError(await put(OPEN, "a", options), 403, "ORIGIN_REFUSED")
    await expectError(
      await put(OPEN, "a", { ...options, origin: "https://ohfootball.pages.dev" }),
      403,
      "ORIGIN_REFUSED",
    )
  })

  it("checks the origin before the game key", async () => {
    await expectError(await put("x", "a", { origin: null }), 403, "ORIGIN_REFUSED")
  })

  it("needs a JSON body", async () => {
    await expectError(await put(OPEN, "a", { type: "text/plain" }), 415, "UNSUPPORTED_MEDIA_TYPE")
    await expectError(await put(OPEN, "a", { type: "" }), 415, "UNSUPPORTED_MEDIA_TYPE")
    await expectError(
      await put(OPEN, "a", { type: null, body: null }),
      415,
      "UNSUPPORTED_MEDIA_TYPE",
    )
    expect((await put(OPEN, "a", { type: "Application/JSON; charset=utf-8" })).status).toBe(200)
  })

  it("is refused with a body over 1024 bytes", async () => {
    const body = JSON.stringify({ side: "a", pad: "x".repeat(1100) })

    await expectError(await put(OPEN, "a", { body }), 413, "BODY_TOO_LARGE")
  })

  it("counts the body in bytes and not in characters", async () => {
    const body = JSON.stringify({ side: "a", pad: "é".repeat(600) })
    expect(body.length).toBeLessThan(1024)

    await expectError(await put(OPEN, "a", { body }), 413, "BODY_TOO_LARGE")
  })

  it("is refused with a streamed body over 1024 bytes that gives no length", async () => {
    const chunk = new TextEncoder().encode(`{"side":"a","pad":"${"x".repeat(500)}`)
    let sent = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1
        if (sent > 100) controller.close()
        else controller.enqueue(chunk)
      },
    })
    const headers = {
      "CF-Connecting-IP": "203.0.113.7",
      Origin: ORIGIN,
      "Content-Type": "application/json",
    }
    const req = new Request(`${ORIGIN}/picks/${OPEN}`, {
      method: "PUT",
      headers,
      body: stream,
      duplex: "half",
    } as RequestInit)
    expect(req.headers.get("Content-Length")).toBeNull()

    await expectError(
      await runtime.put(context(req, env, { gameKey: OPEN })),
      413,
      "BODY_TOO_LARGE",
    )
    expect(sent).toBeLessThan(5)
  })

  it("takes a body of exactly 1024 bytes", async () => {
    const start = '{"side":"a","pad":"'
    const body = `${start}${"x".repeat(1024 - start.length - 2)}"}`
    expect(new TextEncoder().encode(body).byteLength).toBe(1024)

    expect((await put(OPEN, "a", { body })).status).toBe(200)
  })

  it("needs a side of a or b", async () => {
    for (const body of ["", "{", "null", "[]", '"a"', "{}", '{"side":"c"}', '{"side":1}']) {
      await expectError(await put(OPEN, "a", { body }), 400, "INVALID_BODY")
    }
  })

  it("needs a body", async () => {
    await expectError(await put(OPEN, "a", { body: null }), 400, "INVALID_BODY")
  })

  it("checks the body before the address", async () => {
    await expectError(await put(OPEN, "c", { ip: null }), 400, "INVALID_BODY")
  })

  it("is refused when the address is not known", async () => {
    await expectError(await put(OPEN, "a", { ip: null }), 400, "CLIENT_ADDRESS_UNKNOWN")
    await expectError(await put(OPEN, "a", { ip: "1.2.3.256" }), 400, "CLIENT_ADDRESS_UNKNOWN")
    await expectError(await remove(OPEN, { ip: null }), 400, "CLIENT_ADDRESS_UNKNOWN")
  })

  it("checks the address before the game", async () => {
    await expectError(await put(MISSING, "a", { ip: null }), 400, "CLIENT_ADDRESS_UNKNOWN")
  })
})

describe("the removal of a pick", () => {
  it("removes the pick and counts again", async () => {
    await put(OPEN, "a")
    await put(OPEN, "a", { ip: "198.51.100.1" })

    const response = await remove(OPEN)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ gameKey: OPEN, myPick: null, tally: { a: 1, b: 0 } })
    expect((await (await board()).json()).picks).toEqual({})
  })

  it("answers with the tally when the caller had no pick", async () => {
    const response = await remove(OPEN)

    expect(await response.json()).toEqual({ gameKey: OPEN, myPick: null, tally: { a: 0, b: 0 } })
  })

  it("needs no body", async () => {
    expect((await remove(OPEN, { type: "text/plain", body: "x".repeat(5000) })).status).toBe(200)
  })

  it("is refused for a game that is not in the file", async () => {
    await expectError(await remove(MISSING), 404, "GAME_UNKNOWN")
  })
})

describe("the removal of old picks", () => {
  function oldPick() {
    env.PICKS_DB.query(
      `INSERT INTO picks (game_key, ip_hash, side, season, game_date, created_at, updated_at)
       VALUES (?, ?, 'a', 2026, '2026-09-20', 'x', 'x')`,
      OLD,
      "0".repeat(64),
    )
    env.PICKS_DB.query(
      "INSERT OR REPLACE INTO tallies (game_key, season, game_date, a, b) VALUES (?, 2026, '2026-09-20', 1, 0)",
      OLD,
    )
  }

  async function write() {
    const req = request(`/picks/${OPEN}`, { method: "PUT", body: '{"side":"a"}' })
    const ctx = context(req, env, { gameKey: OPEN })
    expect((await runtime.put(ctx)).status).toBe(200)
    await Promise.all(ctx.waits)
    return ctx.waits
  }

  function oldPicks() {
    return env.PICKS_DB.query("SELECT * FROM picks WHERE game_date < '2026-09-26'")
  }

  it("runs after a write, at most once an hour, and keeps the tallies", async () => {
    oldPick()
    expect(await write()).toHaveLength(1)
    expect(oldPicks()).toEqual([])
    expect(env.PICKS_DB.query("SELECT a FROM tallies WHERE game_key = ?", OLD)).toEqual([{ a: 1 }])

    oldPick()
    time += PRUNE_INTERVAL_MS - 1
    expect(await write()).toHaveLength(0)
    expect(oldPicks()).toHaveLength(1)

    time += 1
    expect(await write()).toHaveLength(1)
    expect(oldPicks()).toEqual([])
    expect(env.PICKS_DB.query("SELECT * FROM picks WHERE game_key = ?", OPEN)).toHaveLength(1)
  })

  it("runs again on the next write after it failed", async () => {
    oldPick()
    const release = holdPrune(() => Promise.reject(new Error("D1 is down")))
    expect(await write()).toHaveLength(1)
    expect(oldPicks()).toHaveLength(1)
    release()

    expect(await write()).toHaveLength(1)
    expect(oldPicks()).toEqual([])
  })

  it("does not start while it runs", async () => {
    let finish = () => undefined as unknown
    holdPrune(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const first = context(request(`/picks/${OPEN}`, { method: "PUT", body: '{"side":"a"}' }), env, {
      gameKey: OPEN,
    })
    await runtime.put(first)
    const second = context(
      request(`/picks/${OPEN}`, { method: "PUT", body: '{"side":"b"}' }),
      env,
      { gameKey: OPEN },
    )
    await runtime.put(second)

    expect(first.waits).toHaveLength(1)
    expect(second.waits).toEqual([])
    finish()
    await Promise.all(first.waits)
  })

  it("does not run after a board or a refused write", async () => {
    oldPick()
    const ctx = context(request("/picks/board"), env)
    await runtime.board(ctx)
    await put(LOCKED, "a")

    expect(ctx.waits).toEqual([])
    expect(oldPicks()).toHaveLength(1)
  })

  it("does not fail the write when it fails, and logs the cause", async () => {
    oldPick()
    holdPrune(() => Promise.reject(new Error("D1 is down")))

    const waits = await write()

    expect(waits).toHaveLength(1)
    await expect(waits[0]).resolves.toBeUndefined()
    expect(oldPicks()).toHaveLength(1)
    expect(log()).toContain("the removal of old picks failed")
    expect(log()).toContain("D1 is down")
  })
})

describe("when picks are not available", () => {
  async function everyRoute(on: Env) {
    await expectError(await board({}, on), 503, "PICKS_UNAVAILABLE")
    await expectError(await put(OPEN, "a", {}, on), 503, "PICKS_UNAVAILABLE")
    await expectError(await remove(OPEN, {}, on), 503, "PICKS_UNAVAILABLE")
  }

  it("answers 503 with no database", async () => {
    await everyRoute(testEnv({ PICKS_DB: undefined }))
  })

  it("answers 503 with no secret or a short secret", async () => {
    await everyRoute(testEnv({ PICKS_HASH_SECRET: undefined }))
    await everyRoute(testEnv({ PICKS_HASH_SECRET: "" }))
    await everyRoute(testEnv({ PICKS_HASH_SECRET: "s".repeat(31) }))
  })

  it("answers 503 with no origin or an origin that is not a URL", async () => {
    await everyRoute(testEnv({ PICKS_ORIGIN: undefined }))
    await everyRoute(testEnv({ PICKS_ORIGIN: "ohfootball.io" }))
    await everyRoute(testEnv({ PICKS_ORIGIN: "mailto:hey@ohfootball.io" }))
  })

  it("logs the cause and never the address, its hash, the secret, or the body", async () => {
    const failing = testEnv()
    failing.PICKS_DB.batch = () => Promise.reject(new Error("D1 is down"))
    const body = '{"side":"a","note":"private-body-text"}'

    await expectError(await put(OPEN, "a", { body }, failing), 503, "PICKS_UNAVAILABLE")
    await expectError(await remove(OPEN, {}, failing), 503, "PICKS_UNAVAILABLE")
    await expectError(await board({}, failing), 503, "PICKS_UNAVAILABLE")

    const hash = await createHasher(SECRET)?.("v4:203.0.113.7")
    expect(log()).toContain("the PUT of a pick failed")
    expect(log()).toContain("the DELETE of a pick failed")
    expect(log()).toContain("the board failed")
    expect(log()).toContain("D1 is down")
    for (const secret of ["203.0.113.7", String(hash), SECRET, "private-body-text"]) {
      expect(log()).not.toContain(secret)
    }
  })

  it("logs a cause that is not an error or has no stack", async () => {
    const failing = testEnv()
    failing.PICKS_DB.batch = () => Promise.reject("plain text")
    await expectError(await board({}, failing), 503, "PICKS_UNAVAILABLE")
    const bare = new Error("no stack")
    bare.stack = undefined
    failing.PICKS_DB.batch = () => Promise.reject(bare)
    await expectError(await board({}, failing), 503, "PICKS_UNAVAILABLE")

    expect(log()).toContain("plain text")
    expect(log()).toContain("no stack")
  })

  it("answers 503 when D1 fails", async () => {
    const failing = testEnv()
    failing.PICKS_DB.batch = () => Promise.reject(new Error("D1 is down"))

    await everyRoute(failing)
  })

  it("answers 503 when the games file cannot be read", async () => {
    const statuses = [
      () => new Response("Not found", { status: 404 }),
      () => new Response("<!DOCTYPE html><html><body>Page Not Found</body></html>"),
      () => jsonFile({ games: "none" }),
      () => {
        throw new Error("no assets")
      },
    ]
    for (const answer of statuses) {
      const on = testEnv({ ASSETS: assetsWith(answer) })
      await expectError(await put(OPEN, "a", {}, on), 503, "PICKS_UNAVAILABLE")
      await expectError(await remove(OPEN, {}, on), 503, "PICKS_UNAVAILABLE")
    }
  })

  it("answers the board without the games file", async () => {
    const on = testEnv({ ASSETS: assetsWith(() => new Response("gone", { status: 500 })) })

    expect((await board({}, on)).status).toBe(200)
  })
})

describe("HEAD /picks/board", () => {
  it("gets the status and the headers of GET with no body", async () => {
    const req = request("/picks/board", { method: "HEAD" })

    const response = await runtime.board(context(req, env))

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8")
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(await response.text()).toBe("")
  })

  it("gets 503 when picks are not available", async () => {
    const req = request("/picks/board", { method: "HEAD" })

    const response = await runtime.board(context(req, testEnv({ PICKS_DB: undefined })))

    expect(response.status).toBe(503)
    expect(await response.text()).toBe("")
  })
})

describe("originOf", () => {
  it.each([
    ["https://ohfootball.io", "https://ohfootball.io"],
    ["https://ohfootball.io/", "https://ohfootball.io"],
    ["https://OHFOOTBALL.IO/picks", "https://ohfootball.io"],
    ["http://localhost:8788", "http://localhost:8788"],
  ])("reads %s as %s", (value, origin) => {
    expect(originOf(value)).toBe(origin)
  })

  it.each([undefined, "", "ohfootball.io", "ftp://ohfootball.io", "mailto:hey@ohfootball.io"])(
    "gives no origin for %s",
    (value) => {
      expect(originOf(value)).toBeNull()
    },
  )
})

describe("the games file", () => {
  it("is read from the deployment that answers the request", async () => {
    const assets = assetsWith(() => jsonFile())
    env.ASSETS = assets

    await put(OPEN, "a")

    expect(assets.urls).toEqual([`${ORIGIN}/pickem/games.json`])
  })

  it("is kept for a minute", async () => {
    const assets = assetsWith(() => jsonFile())
    env.ASSETS = assets

    await put(OPEN, "a")
    time += 59_999
    await put(OPEN, "b")
    expect(assets.urls).toHaveLength(1)

    time += 1
    await put(OPEN, "a")
    expect(assets.urls).toHaveLength(2)
  })
})
