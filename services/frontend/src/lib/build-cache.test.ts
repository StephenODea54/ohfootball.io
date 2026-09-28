import { afterEach, describe, expect, it, vi } from "vitest"

// The cache lives in the module, so each test loads a fresh copy of it.
async function loadOnce() {
  vi.resetModules()
  return (await import("@/lib/build-cache")).once
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("once in a build", () => {
  it("asks one time for each key", async () => {
    vi.stubEnv("DEV", false)
    const once = await loadOnce()
    const load = vi.fn(async () => 2026)

    const answers = await Promise.all([once("season", load), once("season", load)])

    expect(answers).toEqual([2026, 2026])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("keeps the answer of each key apart", async () => {
    vi.stubEnv("DEV", false)
    const once = await loadOnce()

    expect(await once("a", async () => "first")).toBe("first")
    expect(await once("b", async () => "second")).toBe("second")
    expect(await once("a", async () => "third")).toBe("first")
  })

  it("keeps a failure, so the build does not ask again", async () => {
    vi.stubEnv("DEV", false)
    const once = await loadOnce()
    const load = vi.fn(async () => {
      throw new Error("no answer")
    })

    await expect(once("teams", load)).rejects.toThrow("no answer")
    await expect(once("teams", load)).rejects.toThrow("no answer")
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe("once in the development server", () => {
  it("asks again on each call", async () => {
    vi.stubEnv("DEV", true)
    const once = await loadOnce()
    const load = vi.fn(async () => 2026)

    await once("season", load)
    await once("season", load)

    expect(load).toHaveBeenCalledTimes(2)
  })
})
