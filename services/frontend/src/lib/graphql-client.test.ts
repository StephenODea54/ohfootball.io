import { afterEach, describe, expect, it, vi } from "vitest"

const settings = vi.hoisted(() => ({ key: undefined as string | undefined }))

vi.mock("astro:env/server", () => ({
  GRAPHQL_URL: "http://api.test/graphql",
  get GRAPHQL_API_KEY() {
    return settings.key
  },
}))

import { graphqlRequest, userAgent } from "@/lib/graphql-client"

function answer(body: unknown, status = 200) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal("fetch", fetch)
  return fetch
}

function headersOf(fetch: ReturnType<typeof answer>) {
  const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
  return init.headers as Record<string, string>
}

afterEach(() => {
  settings.key = undefined
  vi.unstubAllGlobals()
})

describe("graphqlRequest", () => {
  it("sends the query and the variables to the API", async () => {
    const fetch = answer({ data: { currentSeason: 2026 } })

    const data = await graphqlRequest<{ currentSeason: number }>("{ currentSeason }", { a: 1 })

    expect(data).toEqual({ currentSeason: 2026 })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("http://api.test/graphql")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({
      query: "{ currentSeason }",
      variables: { a: 1 },
    })
  })

  it("sends no key when none is set", async () => {
    const fetch = answer({ data: {} })

    await graphqlRequest("{ x }")

    expect(headersOf(fetch)).toEqual({
      "content-type": "application/json",
      "user-agent": userAgent,
    })
  })

  it("names a contact in the User-Agent, as the API asks", () => {
    expect(userAgent).toMatch(/\(https:\/\/ohfootball\.io\)$/)
  })

  it("sends the key as a bearer token when one is set", async () => {
    settings.key = "probe-key-123456"
    const fetch = answer({ data: {} })

    await graphqlRequest("{ x }")

    expect(headersOf(fetch).authorization).toBe("Bearer probe-key-123456")
  })

  it("fails when the API answers with an error status", async () => {
    answer({}, 502)

    await expect(graphqlRequest("{ x }")).rejects.toThrow("status 502")
  })

  it("fails with the messages of the errors the API reports", async () => {
    answer({ data: null, errors: [{ message: "first" }, { message: "second" }] })

    await expect(graphqlRequest("{ x }")).rejects.toThrow("first; second")
  })

  it("fails when the answer holds no data", async () => {
    answer({ errors: [] })

    await expect(graphqlRequest("{ x }")).rejects.toThrow("did not include data")
  })
})
