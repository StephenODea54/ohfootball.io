// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { TeamList } from "@/features/map/components/team-list"
import type { MapMarker } from "@/features/map/utils/markers"

afterEach(cleanup)

function marker(id: string, rank: number, overrides: Partial<MapMarker> = {}): MapMarker {
  return {
    id,
    sourceId: id,
    name: `School ${id}`,
    county: "Stark",
    division: 2,
    region: 7,
    rank,
    rating: 40 - rank,
    x: 0,
    y: 0,
    color: null,
    ...overrides,
  }
}

describe("TeamList", () => {
  it("lists the schools best rated first, with a link and the place of each", () => {
    render(
      <TeamList
        label="Rated schools"
        markers={[marker("b", 30, { county: null, division: null, region: null }), marker("a", 4)]}
      />,
    )

    const rows = within(screen.getByRole("grid", { name: "Rated schools" })).getAllByRole("row")
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getByRole("link", { name: "School a" }).getAttribute("href")).toBe(
      "/teams/a",
    )
    expect(within(rows[1]).getByText("Stark · D-II · Region 7")).toBeTruthy()
    expect(within(rows[1]).getByText("+36.0")).toBeTruthy()
    expect(within(rows[2]).getByText("Independent")).toBeTruthy()
    expect(within(rows[2]).getByText("+10.0")).toBeTruthy()
  })
})
