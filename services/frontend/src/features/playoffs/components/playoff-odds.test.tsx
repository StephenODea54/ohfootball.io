// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { loadRegion } from "@/features/playoffs/api/load-region"
import { PlayoffOdds } from "@/features/playoffs/components/playoff-odds"
import type { PlayoffDetail, PlayoffRow, RegionData } from "@/features/playoffs/types"

const row = (sourceId: string, name: string, qualify: number): PlayoffRow => ({
  sourceId,
  name,
  rating: sourceId === "b" ? null : 12.3,
  record: "5-3",
  qualifyProbability: qualify,
  byeProbability: qualify / 2,
  homeProbability: qualify / 3,
  regionWinProbability: qualify / 4,
})

const detail = (rough: boolean, games: boolean): PlayoffDetail => ({
  teamId: "team-b",
  sourceId: "b",
  name: "Medina",
  record: "5-3",
  levelOne: 13,
  levelTwo: 147.25,
  divisor: 96,
  average: 8.02,
  homeProbability: 0.1,
  remainingGames: games
    ? [
        {
          id: "g1",
          date: "2026-10-23",
          opponentName: "Solon",
          location: "AWAY",
          winProbability: 0.5,
          qualifyIfWin: 0.96,
          qualifyIfLoss: 0.01,
        },
      ]
    : [],
  records: [
    {
      record: { wins: 6, losses: 3, ties: 0 },
      probability: 0.5,
      runs: rough ? 300 : 5000,
      lowAverage: 9.1,
      highAverage: 11.2,
      qualifyProbability: 0.96,
    },
  ],
})

const first: { region: number; data: RegionData } = {
  region: 1,
  data: { rows: [row("a", "Mentor", 1), row("b", "Medina", 0.61)], details: [] },
}
const regions = [
  { region: 1, division: 1 },
  { region: 2, division: 1 },
  { region: 5, division: 2 },
  { region: 6, division: 2 },
]
const props = { regions, first, qualifiers: 12, byes: 4, runs: 100_000, map: null }

function serve(files: Record<string, RegionData | null>) {
  const fetch = vi.fn(async (url: string) => {
    const data = files[url]
    return data
      ? new Response(JSON.stringify(data), { status: 200 })
      : new Response("", { status: 404 })
  })
  vi.stubGlobal("fetch", fetch)
  return fetch
}

beforeEach(() => {
  window.history.replaceState(null, "", "/playoffs")
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("PlayoffOdds", () => {
  it("shows the first region and writes the choice into the address", () => {
    render(<PlayoffOdds {...props} />)

    const table = screen.getByRole("grid", { name: "Region 1 playoff odds" })
    expect(within(table).getByText("Mentor")).toBeTruthy()
    expect(within(table).getByText("12.3")).toBeTruthy()
    expect(within(table).getByText("–")).toBeTruthy()
    expect(window.location.search).toBe("?division=1&region=1")
  })

  it("loads the region of a link from its file", async () => {
    serve({ "/playoffs/regions/5.json": { rows: [row("d", "Avon", 0.5)], details: [] } })
    window.history.replaceState(null, "", "/playoffs?division=2&region=5")
    render(<PlayoffOdds {...props} />)

    await waitFor(() =>
      expect(screen.getByRole("grid", { name: "Region 5 playoff odds" })).toBeTruthy(),
    )
    expect(screen.getByText("Avon")).toBeTruthy()

    fireEvent.click(screen.getByRole("radio", { name: "Division I" }))
    expect(screen.getByRole("grid", { name: "Region 1 playoff odds" })).toBeTruthy()
    expect(window.location.search).toBe("?division=1&region=1")
  })

  it("says when a region did not load", async () => {
    serve({})
    window.history.replaceState(null, "", "/playoffs?division=1&region=2")
    render(<PlayoffOdds {...props} />)

    await waitFor(() => expect(screen.getByText(/did not load/)).toBeTruthy())
  })

  it("shows the chance of a home game in a season without byes", () => {
    render(<PlayoffOdds {...props} byes={0} />)

    expect(screen.getAllByText("Home Game").length).toBe(1)
    // Medina has a chance of 0.61 to qualify and 0.2033 to play at home.
    expect(screen.getByText("20%")).toBeTruthy()
  })

  it("opens the details of a team from its row", async () => {
    serve({ "/playoffs/regions/1.json": { ...first.data, details: [detail(true, true)] } })
    render(<PlayoffOdds {...props} />)

    fireEvent.click(screen.getByText("Medina"))

    await waitFor(() => expect(screen.getByText("at Solon")).toBeTruthy())
    expect(screen.getByText(/Level 2 147.25/)).toBeTruthy()
    expect(screen.getByText("9.10-11.20")).toBeTruthy()
    expect(screen.getByText(/Fewer than 500 runs/)).toBeTruthy()
  })

  it("leaves out the games of a team with none left, and the mark of a firm record", async () => {
    // Region 2, because the page keeps the file of region 1 that an earlier test loaded.
    serve({ "/playoffs/regions/2.json": { ...first.data, details: [detail(false, false)] } })
    window.history.replaceState(null, "", "/playoffs?division=1&region=2")
    render(<PlayoffOdds {...props} />)
    await waitFor(() => expect(screen.getByText("Medina")).toBeTruthy())

    fireEvent.click(screen.getByText("Medina"))

    await waitFor(() => expect(screen.getByText("By Final Record")).toBeTruthy())
    expect(screen.queryByText("What Each Game Means")).toBeNull()
    expect(screen.queryByText(/Fewer than 500 runs/)).toBeNull()
  })

  it("says when the details of a team are missing", async () => {
    serve({ "/playoffs/regions/6.json": first.data })
    window.history.replaceState(null, "", "/playoffs?division=2&region=6")
    render(<PlayoffOdds {...props} />)
    await waitFor(() => expect(screen.getByText("Mentor")).toBeTruthy())

    fireEvent.click(screen.getByText("Mentor"))

    await waitFor(() => expect(screen.getByText(/did not load/)).toBeTruthy())
  })

  it("chooses a region from the map", async () => {
    const shape = (region: number) => ({ region, path: "M1,1Z", label: { x: 10, y: 10 } })
    const map = {
      width: 400,
      height: 420,
      outline: "M0,0Z",
      // Region 3 has no odds, so the map leaves it out.
      divisions: { 1: [shape(1), shape(2), shape(3)], 2: [shape(5), shape(6)] },
    }
    serve({ "/playoffs/regions/2.json": first.data })
    render(<PlayoffOdds {...props} map={map} />)
    expect(screen.queryByRole("link", { name: "Region 3" })).toBeNull()

    fireEvent.click(screen.getByRole("link", { name: "Region 2" }))

    await waitFor(() =>
      expect(screen.getByRole("grid", { name: "Region 2 playoff odds" })).toBeTruthy(),
    )
    expect(window.location.search).toBe("?division=1&region=2")
    expect(screen.getByRole("link", { name: "Region 2" }).getAttribute("aria-current")).toBe("page")
  })
})

describe("loadRegion", () => {
  it("reports a file that did not load, and tries again on the next call", async () => {
    const fetch = serve({})

    await expect(loadRegion(27)).rejects.toThrow("region 27")
    await expect(loadRegion(27)).rejects.toThrow("region 27")
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
