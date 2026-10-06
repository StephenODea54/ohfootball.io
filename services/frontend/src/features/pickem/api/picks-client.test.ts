import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createPicksClient,
  PICKS_UNAVAILABLE,
  PicksError,
  pickAddress,
} from "@/features/pickem/api/picks-client"

const GAME = "0b5c7c1e-7b8a-4a8e-9a43-2f1d6c3e9b10"

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  })
}

function failure(status: number, code: string): Response {
  return json({ error: { code, message: "no" } }, status)
}

const board = {
  address: "known",
  cutoff: "2026-09-26",
  picks: { [GAME]: "a" },
  tallies: { [GAME]: { a: 3, b: 1 } },
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (cause: unknown) => cause,
  )
  expect(error).toBeInstanceOf(PicksError)
  return (error as PicksError).code
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("createPicksClient", () => {
  it("reads the board", async () => {
    const fetcher = vi.fn(async () => json(board))

    expect(await createPicksClient(fetcher).loadBoard()).toEqual(board)
    expect(fetcher).toHaveBeenCalledWith("/picks/board", { method: "GET" })
  })

  it("sends a pick as JSON and reads the answer", async () => {
    const answer = { gameKey: GAME, myPick: "b", tally: { a: 3, b: 2 } }
    const fetcher = vi.fn(async () => json(answer))

    expect(await createPicksClient(fetcher).putPick(GAME, "b")).toEqual(answer)
    expect(fetcher).toHaveBeenCalledWith(`/picks/${GAME}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: '{"side":"b"}',
    })
  })

  it("removes a pick", async () => {
    const answer = { gameKey: GAME, myPick: null, tally: { a: 2, b: 1 } }
    const fetcher = vi.fn(async () => json(answer))

    expect(await createPicksClient(fetcher).removePick(GAME)).toEqual(answer)
    expect(fetcher).toHaveBeenCalledWith(`/picks/${GAME}`, { method: "DELETE" })
  })

  it.each([
    [403, "ORIGIN_REFUSED"],
    [400, "INVALID_GAME_KEY"],
    [400, "INVALID_BODY"],
    [400, "CLIENT_ADDRESS_UNKNOWN"],
    [404, "GAME_UNKNOWN"],
    [409, "GAME_CANCELED"],
    [409, "GAME_FINAL"],
    [409, "GAME_LOCKED"],
    [413, "BODY_TOO_LARGE"],
    [415, "UNSUPPORTED_MEDIA_TYPE"],
    [503, "PICKS_UNAVAILABLE"],
  ])("gives the code of a %i answer: %s", async (status, code) => {
    const client = createPicksClient(async () => failure(status, code))

    expect(await codeOf(client.putPick(GAME, "a"))).toBe(code)
    expect(await codeOf(client.removePick(GAME))).toBe(code)
  })

  it("counts the 404 page of the site as unavailable", async () => {
    const page = new Response("<!doctype html><title>Not found</title>", {
      status: 404,
      headers: { "Content-Type": "text/html" },
    })
    const client = createPicksClient(async () => page)

    expect(await codeOf(client.loadBoard())).toBe(PICKS_UNAVAILABLE)
  })

  it("counts a page that answers 200 with HTML as unavailable", async () => {
    const client = createPicksClient(
      async () => new Response("<html></html>", { headers: { "Content-Type": "text/html" } }),
    )

    expect(await codeOf(client.putPick(GAME, "a"))).toBe(PICKS_UNAVAILABLE)
  })

  it("counts JSON that does not parse as unavailable", async () => {
    const client = createPicksClient(
      async () => new Response("{", { headers: { "Content-Type": "application/json" } }),
    )

    expect(await codeOf(client.loadBoard())).toBe(PICKS_UNAVAILABLE)
  })

  it("counts an answer of the wrong shape as unavailable", async () => {
    const client = createPicksClient(async () => json({ address: "maybe" }))

    expect(await codeOf(client.loadBoard())).toBe(PICKS_UNAVAILABLE)
    expect(await codeOf(client.putPick(GAME, "a"))).toBe(PICKS_UNAVAILABLE)
  })

  it("counts an error with no code, or a code that is not text, as unavailable", async () => {
    const client = createPicksClient(async () => json({ error: { code: 7 } }, 500))
    expect(await codeOf(client.loadBoard())).toBe(PICKS_UNAVAILABLE)

    const plain = createPicksClient(async () => json({ message: "no" }, 500))
    expect(await codeOf(plain.loadBoard())).toBe(PICKS_UNAVAILABLE)
  })

  it("counts a failed request as unavailable", async () => {
    const client = createPicksClient(async () => {
      throw new TypeError("offline")
    })

    expect(await codeOf(client.loadBoard())).toBe(PICKS_UNAVAILABLE)
  })

  it("uses the fetch of the browser by default", async () => {
    const fetch = vi.fn(async () => json(board))
    vi.stubGlobal("fetch", fetch)

    await createPicksClient().loadBoard()

    expect(fetch).toHaveBeenCalledWith("/picks/board", { method: "GET" })
  })

  it("writes the address of a game", () => {
    expect(pickAddress(GAME)).toBe(`/picks/${GAME}`)
  })

  it("has a short message for each error", () => {
    expect(new PicksError("GAME_LOCKED").message).toBe("Picks are not available right now.")
    expect(new PicksError("GAME_LOCKED", "closed").name).toBe("PicksError")
  })
})
