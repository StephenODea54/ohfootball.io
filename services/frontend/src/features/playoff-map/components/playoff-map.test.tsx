// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { PlayoffMap } from "@/features/playoff-map/components/playoff-map"
import { division, shape } from "@/features/playoff-map/test/fixtures"
import type { PlayoffMapDivision } from "@/features/playoff-map/types"

afterEach(cleanup)

const fill = (container: HTMLElement, cell: number) =>
  (container.querySelectorAll("[data-cell]")[cell] as HTMLElement).style.getPropertyValue("--tint")

const cellOf = (container: HTMLElement, cell: number) =>
  container.querySelectorAll("[data-cell]")[cell] as Element

describe("PlayoffMap", () => {
  it("opens at the last round with a result and gives the land of each loser to its winner", () => {
    const { container } = render(<PlayoffMap map={shape} division={division} />)

    // Round 4 is the last with a result, so a holds the cell of b.
    expect(
      screen.getByRole("radio", { name: "Regional finals" }).getAttribute("aria-checked"),
    ).toBe("true")
    expect(cellOf(container, 1).getAttribute("data-cell")).toBe("a")
    const west = screen.getByText("Region 1").closest("[data-slot=card]") ?? document.body
    expect(within(west as HTMLElement).getByText("Champion")).toBeTruthy()
    expect(within(west as HTMLElement).getByText("Out")).toBeTruthy()
    expect(
      within(west as HTMLElement).getByText("Lost in the first round to School a"),
    ).toBeTruthy()
  })

  it("goes back to the seeds, where each team holds its own land", () => {
    const { container } = render(<PlayoffMap map={shape} division={division} />)

    fireEvent.click(screen.getByRole("radio", { name: "Seeds" }))

    expect(screen.getByRole("radio", { name: "Seeds" }).getAttribute("aria-checked")).toBe("true")
    expect(cellOf(container, 1).getAttribute("data-cell")).toBe("b")
    expect(screen.queryByText("Champion")).toBeNull()
    expect(screen.getAllByText("60%")).toHaveLength(2)
    expect(fill(container, 0)).toBe("var(--color-muted-fg)")
  })

  it("keeps the rounds with no result closed, with a note before the first game", () => {
    const quiet: PlayoffMapDivision = {
      ...division,
      regions: division.regions.map((region) => ({ ...region, games: [] })),
    }
    render(<PlayoffMap map={shape} division={quiet} />)

    expect(screen.getByRole("radio", { name: "Seeds" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radio", { name: "First round" }).hasAttribute("disabled")).toBe(true)
    expect(screen.getByText("The rounds open here as the games are played.")).toBeTruthy()
  })

  it("shows the card of a team with its seed and its share of the region", () => {
    const { container } = render(<PlayoffMap map={shape} division={division} />)
    fireEvent.click(screen.getByRole("radio", { name: "Seeds" }))

    fireEvent.pointerOver(cellOf(container, 2), { pointerType: "mouse" })

    expect(screen.getByText("Seed 1 · 60% of Region 2")).toBeTruthy()
  })
})
