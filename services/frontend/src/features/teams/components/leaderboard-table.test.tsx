// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LeaderboardTable } from "@/features/teams/components/leaderboard-table"
import { countySummary } from "@/features/teams/utils/format"
import { OUT_OF_STATE_LEGEND } from "@/features/teams/utils/out-of-state"
import { hydrateTyped } from "@/test/hydrate-typed"
import { teamSummary } from "@/test/team-summary"

function rating(rank: number, value: number) {
  return { season: 2026, value, rank, previousRank: null, asOf: "2026-09-27" }
}

const teams = [
  teamSummary({
    id: "canton-mckinley",
    name: "Canton McKinley",
    county: "Stark",
    rating: rating(1, 30),
  }),
  teamSummary({
    id: "massillon-washington",
    name: "Massillon Washington",
    county: "Stark",
    rating: rating(2, 25),
  }),
  teamSummary({ id: "troy", name: "Troy", county: "Miami", rating: rating(3, 10) }),
  teamSummary({ id: "unrated", name: "Unrated Academy", county: "Stark", rating: null }),
]

/** 120 rated schools, ranked 1 to 120. Every third school is in Stark County. */
const manyTeams = Array.from({ length: 120 }, (_, index) =>
  teamSummary({
    id: `school-${index + 1}`,
    name: `School ${index + 1}`,
    county: index % 3 === 0 ? "Stark" : "Miami",
    // Only School 60 played enough games against teams from other states to get the mark.
    outOfStateGamesPlayed: index === 59 ? 3 : 0,
    rating: rating(index + 1, 120 - index),
  }),
)

afterEach(() => {
  cleanup()
  document.body.innerHTML = ""
  vi.restoreAllMocks()
})

function renderTable() {
  render(<LeaderboardTable season={2026} teams={teams} />)
}

/** Types into the name search and gives back the field. */
function search(text: string) {
  const input = screen.getByRole<HTMLInputElement>("searchbox", { name: "Search By School Name" })
  fireEvent.change(input, { target: { value: text } })
  return input
}

/** The rows of the table, without the header row. */
function bodyRows() {
  return screen.getAllByRole("row").slice(1)
}

describe("LeaderboardTable", () => {
  it("lists only the rated schools", () => {
    renderTable()

    expect(bodyRows()).toHaveLength(3)
    expect(screen.queryByText("Unrated Academy")).toBeNull()
  })

  it("shows the typed text at once and narrows the table after a pause", async () => {
    renderTable()

    expect(search("Troy").value).toBe("Troy")
    expect(bodyRows()).toHaveLength(3)

    await waitFor(() => expect(bodyRows()).toHaveLength(1))
    expect(screen.getByText("Troy")).toBeTruthy()
  })

  it("says when no rated school matches", async () => {
    renderTable()

    search("zzz")

    expect(await screen.findByText("No Rated Schools Found")).toBeTruthy()
    expect(screen.getByRole("status").textContent).toContain("No Rated Schools Found")
  })

  it("applies a county at once", async () => {
    renderTable()

    fireEvent.click(screen.getByRole("button", { name: /Filter By County/ }))
    fireEvent.click(await screen.findByRole("option", { name: "Stark County" }))

    expect(screen.getByText(countySummary(2, "Stark"))).toBeTruthy()
    expect(bodyRows()).toHaveLength(2)
  })

  it("keeps the text typed before the page hydrated and narrows the table to it", async () => {
    const { input } = hydrateTyped(<LeaderboardTable season={2026} teams={teams} />, "Troy")

    await waitFor(() => expect(bodyRows()).toHaveLength(1))
    expect(input.value).toBe("Troy")
  })
})

describe("LeaderboardTable pages", () => {
  function renderMany() {
    render(<LeaderboardTable season={2026} teams={manyTeams} />)
  }

  /** The names of the schools on the page. */
  function schoolNames() {
    return bodyRows().map((row) => row.querySelector("a")?.textContent)
  }

  function goToPage(page: number) {
    fireEvent.click(screen.getByRole("button", { name: `Page ${page}` }))
  }

  it("shows the first fifty schools", () => {
    renderMany()

    expect(schoolNames()).toHaveLength(50)
    expect(schoolNames()[0]).toBe("School 1")
    expect(screen.getByText("Schools 1–50 of 120")).toBeTruthy()
  })

  it("shows the next fifty schools on the next page", () => {
    renderMany()

    fireEvent.click(screen.getByRole("button", { name: "Next page" }))

    expect(schoolNames()).toHaveLength(50)
    expect(schoolNames()[0]).toBe("School 51")
    expect(screen.getByText("Schools 51–100 of 120")).toBeTruthy()
  })

  it("draws the rating bars against every school that passes the filters", () => {
    renderMany()
    goToPage(3)

    // School 101 has a rating of 20 in a range of 1 to 120, so its bar is not full.
    const bar = screen.getByRole("progressbar", { name: /^School 101 rating/ })
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeCloseTo((19 / 119) * 100)
  })

  it("goes back to page 1 at once when a select changes", async () => {
    renderMany()
    goToPage(3)

    fireEvent.click(screen.getByRole("button", { name: /Filter By County/ }))
    fireEvent.click(await screen.findByRole("option", { name: "Stark County" }))

    expect(screen.getByText("Schools 1–40 of 40")).toBeTruthy()
    expect(schoolNames()[0]).toBe("School 1")
    expect(screen.queryByRole("navigation", { name: "Leaderboard pages" })).toBeNull()
  })

  it("goes back to page 1 when the search changes", async () => {
    renderMany()
    goToPage(2)

    search("School 1")
    expect(screen.getByText("Schools 1–50 of 120")).toBeTruthy()

    // School 1, 10 to 19, and 100 to 120 match.
    await waitFor(() => expect(screen.getByText("Schools 1–32 of 32")).toBeTruthy())
  })

  it("keeps the page when the parent draws again with the same schools", () => {
    const { rerender } = render(<LeaderboardTable season={2026} teams={manyTeams} />)
    goToPage(2)

    rerender(<LeaderboardTable season={2026} teams={manyTeams} />)

    expect(schoolNames()[0]).toBe("School 51")
  })

  it("brings the table back into view when its top has scrolled away", () => {
    const scrollIntoView = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => {})
    renderMany()
    const results = screen.getByRole("grid").closest(".scroll-mt-20") as HTMLElement
    vi.spyOn(results, "getBoundingClientRect").mockReturnValue({ top: -400 } as DOMRect)

    goToPage(2)

    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "start" })
  })

  it("does not scroll when the top of the table is in view", () => {
    const scrollIntoView = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => {})
    renderMany()

    goToPage(2)

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it("explains the mark only on a page that shows it", () => {
    renderMany()
    expect(screen.queryByText(OUT_OF_STATE_LEGEND)).toBeNull()

    goToPage(2)

    expect(screen.getByText(OUT_OF_STATE_LEGEND)).toBeTruthy()
  })
})
