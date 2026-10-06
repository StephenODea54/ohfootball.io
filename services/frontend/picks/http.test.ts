import { describe, expect, it } from "vitest"
import { error, json, methodNotAllowed, unavailable } from "./http"

describe("json", () => {
  it("sends JSON that no cache keeps and no browser sniffs", async () => {
    const response = json({ ok: true })

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(response.headers.get("Referrer-Policy")).toBeNull()
    expect(await response.json()).toEqual({ ok: true })
  })
})

describe("error", () => {
  it("sends the code and the message", async () => {
    const response = error(404, "GAME_UNKNOWN", "No game.")

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: { code: "GAME_UNKNOWN", message: "No game." } })
  })

  it("answers 503 when picks are not available", async () => {
    const response = unavailable()

    expect(response.status).toBe(503)
    expect((await response.json()).error.code).toBe("PICKS_UNAVAILABLE")
  })

  it("names the methods an address takes", async () => {
    const response = methodNotAllowed("PUT, DELETE")

    expect(response.status).toBe(405)
    expect(response.headers.get("Allow")).toBe("PUT, DELETE")
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect((await response.json()).error.code).toBe("METHOD_NOT_ALLOWED")
  })
})
