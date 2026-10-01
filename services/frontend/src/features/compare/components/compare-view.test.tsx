// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CompareView } from "@/features/compare/components/compare-view"
import type { ProgramHistory } from "@/features/compare/types"

function history(sourceId: string, name: string, games: ProgramHistory["games"] = []) {
  return {
    sourceId,
    name,
    teamId: `team-${sourceId}`,
    seasons: [{ season: 2025, rating: 10, rank: 50, asOf: "2025-12-31" }],
    games,
  } satisfies ProgramHistory
}

const massillon = history("1624", "Massillon Washington", [
  {
    season: 2025,
    date: "2025-10-25",
    opponentSourceId: "306",
    result: "WIN",
    teamScore: 21,
    opponentScore: 14,
    playoff: false,
  },
])
const mckinley = history("306", "Canton McKinley")
const piqua = history("1258", "Piqua")
const programs = [massillon, mckinley, piqua].map(({ sourceId, name }) => ({ sourceId, name }))
const files = new Map([massillon, mckinley, piqua].map((file) => [file.sourceId, file]))

/** Answers each history file as the site does. An id in `missing` answers 404. */
function serveFiles(missing: string[] = []) {
  const fetch = vi.fn(async (input: string) => {
    const sourceId = input.match(/\/programs\/(\d+)\.json$/)?.[1] ?? ""
    const file = missing.includes(sourceId) ? undefined : files.get(sourceId)
    return { ok: file !== undefined, json: async () => file }
  })
  vi.stubGlobal("fetch", fetch)
  return fetch
}

function visit(address: string) {
  window.history.replaceState(null, "", address)
}

beforeEach(() => {
  visit("/compare")
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("CompareView", () => {
  it("reads the pair from the address and loads both schools", async () => {
    const fetch = serveFiles()
    visit("/compare?a=1624&b=306")

    render(<CompareView season={2026} programs={programs} />)

    expect(await screen.findByText("Massillon Washington leads 1–0")).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith("/programs/1624.json")
    expect(fetch).toHaveBeenCalledWith("/programs/306.json")
    expect(window.location.search).toBe("?a=1624&b=306")
  })

  it("writes the address again without a school it left out", async () => {
    serveFiles()
    visit("/compare?a=1624&b=1624")

    render(<CompareView season={2026} programs={programs} />)

    expect(await screen.findByText("Pick two different schools.")).toBeTruthy()
    expect(window.location.search).toBe("?a=1624")
  })

  it("names an id it does not know and drops it from the address", async () => {
    serveFiles()
    visit("/compare?a=99999&b=306")

    render(<CompareView season={2026} programs={programs} />)

    expect(
      await screen.findByText('No school with the id "99999" has a page this season.'),
    ).toBeTruthy()
    expect(window.location.search).toBe("?b=306")
  })

  it("says when the site has no file for a school, and stops waiting for it", async () => {
    serveFiles(["306"])
    visit("/compare?b=306")

    render(<CompareView season={2026} programs={programs} />)

    expect(await screen.findByText("The site has no ratings for Canton McKinley.")).toBeTruthy()
    expect(screen.queryByText("Loading the ratings…")).toBeNull()
    expect(screen.getByText(/Pick two schools/)).toBeTruthy()
  })

  it("says when a file did not load, and stops waiting for it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline")
      }),
    )
    visit("/compare?a=1624")

    render(<CompareView season={2026} programs={programs} />)

    expect(
      await screen.findByText("The ratings of Massillon Washington did not load. Try again later."),
    ).toBeTruthy()
    expect(screen.queryByText("Loading the ratings…")).toBeNull()
  })

  it("swaps the schools and writes the new pair into the address", async () => {
    serveFiles()
    visit("/compare?a=1624&b=306")
    const replaceState = vi.spyOn(window.history, "replaceState")

    render(<CompareView season={2026} programs={programs} />)
    await screen.findByText("Massillon Washington leads 1–0")
    fireEvent.click(screen.getByRole("button", { name: "Swap the schools" }))

    expect(window.location.search).toBe("?a=306&b=1624")
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/compare?a=306&b=1624")
    expect(screen.getByRole("combobox", { name: "First School" })).toHaveProperty(
      "value",
      "Canton McKinley",
    )
  })

  it("writes a school picked in a field into the address", async () => {
    serveFiles()
    visit("/compare?a=1624")

    render(<CompareView season={2026} programs={programs} />)
    const input = screen.getByRole("combobox", { name: "Second School" })
    act(() => {
      input.focus()
    })
    fireEvent.change(input, { target: { value: "Piq" } })
    fireEvent.click(await screen.findByRole("option", { name: "Piqua" }))

    expect(window.location.search).toBe("?a=1624&b=1258")
  })

  it("draws the chart, the record, and the season table of a pair", async () => {
    serveFiles()
    visit("/compare?a=1624&b=306")

    render(<CompareView season={2026} programs={programs} />)

    expect(await screen.findByText("Massillon Washington leads 1–0")).toBeTruthy()
    expect(screen.getByText("Total Meetings").nextElementSibling?.textContent).toBe("1")
    expect(
      screen.getByRole("img", { name: /End of season rating of Massillon Washington and Canton/ }),
    ).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Season By Season" })).toBeTruthy()
  })

  it("says when the two schools never met", async () => {
    serveFiles()
    visit("/compare?a=1258&b=306")

    render(<CompareView season={2026} programs={programs} />)

    expect(await screen.findByText(/Piqua and Canton McKinley have not played/)).toBeTruthy()
  })
})
