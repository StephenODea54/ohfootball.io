// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { LeaderboardTable } from "@/features/teams/components/leaderboard-table"
import { countySummary } from "@/features/teams/utils/format"
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

afterEach(cleanup)

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
  })

  it("applies a county at once", async () => {
    renderTable()

    fireEvent.click(screen.getByRole("button", { name: /Filter By County/ }))
    fireEvent.click(await screen.findByRole("option", { name: "Stark County" }))

    expect(screen.getByText(countySummary(2, "Stark"))).toBeTruthy()
    expect(bodyRows()).toHaveLength(2)
  })
})
