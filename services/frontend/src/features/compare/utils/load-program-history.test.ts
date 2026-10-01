import { afterEach, describe, expect, it, vi } from "vitest"
import { loadProgramHistory } from "@/features/compare/utils/load-program-history"

const history = { sourceId: "1624", name: "Massillon Washington" }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("loadProgramHistory", () => {
  it("reads the history file of the program", async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => history }))

    expect(await loadProgramHistory("1624", fetcher)).toEqual(history)
    expect(fetcher).toHaveBeenCalledWith("/programs/1624.json")
  })

  it("gives null when the site has no file", async () => {
    const fetcher = vi.fn(async () => ({ ok: false, json: async () => ({}) }))

    expect(await loadProgramHistory("99999", fetcher)).toBeNull()
  })

  it("asks for nothing with an id that is not safe", async () => {
    const fetcher = vi.fn()

    expect(await loadProgramHistory("../x", fetcher)).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("uses the fetch of the browser by default", async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => history }))
    vi.stubGlobal("fetch", fetch)

    expect(await loadProgramHistory("1624")).toEqual(history)
    expect(fetch).toHaveBeenCalledWith("/programs/1624.json")
  })
})
