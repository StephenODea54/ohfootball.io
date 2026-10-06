import { describe, expect, it } from "vitest"
import * as gameRoute from "../functions/picks/[gameKey]"
import * as boardRoute from "../functions/picks/board"
import { assetsWith, context, gamesFile, jsonFile, OPEN, request, testEnv } from "./test/fixtures"

// The routes share one runtime with the real clock, so these tests check only how each route
// passes a request on. runtime.test.ts checks the answers.
type Handler = (context: never) => Response | Promise<Response>

function call(handler: Handler, ctx: unknown): Promise<Response> {
  return Promise.resolve(handler(ctx as never))
}

describe("the files under functions/", () => {
  it("answer the board", async () => {
    const response = await call(
      boardRoute.onRequestGet,
      context(request("/picks/board"), testEnv()),
    )

    expect(response.status).toBe(200)
    expect((await response.json()).address).toBe("known")
  })

  it("store and remove a pick", async () => {
    // The routes read the real clock, so the game here locks long after any run of the tests.
    const file = gamesFile()
    file.games[0].lockAt = "2999-01-01T05:00:00.000Z"
    const env = testEnv({ ASSETS: assetsWith(() => jsonFile(file)) })
    const params = { gameKey: OPEN }
    const body = '{"side":"a"}'
    const stored = await call(
      gameRoute.onRequestPut,
      context(request(`/picks/${OPEN}`, { method: "PUT", body }), env, params),
    )
    const removed = await call(
      gameRoute.onRequestDelete,
      context(request(`/picks/${OPEN}`, { method: "DELETE" }), env, params),
    )

    expect(await stored.json()).toEqual({ gameKey: OPEN, myPick: "a", tally: { a: 1, b: 0 } })
    expect(await removed.json()).toEqual({ gameKey: OPEN, myPick: null, tally: { a: 0, b: 0 } })
  })

  it("answer HEAD of the board with no body", async () => {
    const req = request("/picks/board", { method: "HEAD" })

    const response = await call(boardRoute.onRequestHead, context(req, testEnv()))

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("")
  })

  it("answer 503 until the database is bound", async () => {
    const env = testEnv({ PICKS_DB: undefined })

    const response = await call(boardRoute.onRequestGet, context(request("/picks/board"), env))

    expect(response.status).toBe(503)
  })

  it("answer 405 to another method", async () => {
    const board = await call(boardRoute.onRequest, {})
    const game = await call(gameRoute.onRequest, {})

    expect(board.status).toBe(405)
    expect(board.headers.get("Allow")).toBe("GET, HEAD")
    expect(game.status).toBe(405)
    expect(game.headers.get("Allow")).toBe("PUT, DELETE")
  })
})
