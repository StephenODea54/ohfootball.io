// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TeamSearch } from "@/features/teams/components/team-search"
import { openTeam } from "@/features/teams/utils/open-team"
import { teamSummary } from "@/test/team-summary"

vi.mock("@/features/teams/utils/open-team", () => ({ openTeam: vi.fn() }))

const teams = [
  teamSummary({ id: "canton-mckinley", name: "Canton McKinley" }),
  teamSummary({ id: "massillon-washington", name: "Massillon Washington" }),
  teamSummary({ id: "troy", name: "Troy" }),
]

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/** Types into the search field and gives back the field. */
function type(text: string) {
  const input = screen.getByRole<HTMLInputElement>("combobox", { name: "Find Your School" })
  act(() => {
    input.focus()
  })
  fireEvent.change(input, { target: { value: text } })
  return input
}

function optionNames() {
  return screen.getAllByRole("option").map((option) => option.textContent)
}

describe("TeamSearch", () => {
  it("shows the typed text at once", () => {
    render(<TeamSearch teams={teams} />)

    expect(type("Mas").value).toBe("Mas")
  })

  it("lists the matches after a pause", async () => {
    render(<TeamSearch teams={teams} />)

    type("Mas")
    expect(optionNames()).toEqual(["Canton McKinley", "Massillon Washington", "Troy"])

    await waitFor(() => expect(optionNames()).toEqual(["Massillon Washington"]))
  })

  it("says when no school matches", async () => {
    render(<TeamSearch teams={teams} />)

    type("zzz")

    expect(await screen.findByText("No school matches that name.")).toBeTruthy()
  })

  it("shows every school again when the text is cleared", async () => {
    render(<TeamSearch teams={teams} />)
    type("Troy")
    await waitFor(() => expect(optionNames()).toEqual(["Troy"]))

    type("")

    await waitFor(() =>
      expect(optionNames()).toEqual(["Canton McKinley", "Massillon Washington", "Troy"]),
    )
  })

  it("opens the page of the chosen school", async () => {
    render(<TeamSearch teams={teams} />)
    type("Troy")
    await waitFor(() => expect(optionNames()).toEqual(["Troy"]))

    fireEvent.click(screen.getByRole("option", { name: "Troy" }))

    expect(openTeam).toHaveBeenCalledWith("troy")
  })
})
