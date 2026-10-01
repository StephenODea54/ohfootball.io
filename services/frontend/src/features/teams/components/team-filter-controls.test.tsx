import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { CountySelect, countyItems } from "@/features/teams/components/team-filter-controls"
import { ALL_COUNTIES } from "@/features/teams/utils/filter-teams"

describe("countyItems", () => {
  it("lists each county once, A to Z, after All Counties", () => {
    const teams = [
      { county: "Van Wert" },
      { county: "Stark" },
      { county: null },
      { county: "Stark" },
    ]

    expect(countyItems(teams)).toEqual([
      { id: ALL_COUNTIES, label: "All Counties" },
      { id: "Stark", label: "Stark County" },
      { id: "Van Wert", label: "Van Wert County" },
    ])
  })

  it("has only All Counties when no team has a county", () => {
    expect(countyItems([{ county: null }])).toEqual([{ id: ALL_COUNTIES, label: "All Counties" }])
  })
})

describe("CountySelect", () => {
  it("renders a labeled Select", () => {
    const html = renderToStaticMarkup(
      <CountySelect onChange={() => {}} teams={[]} value={ALL_COUNTIES} />,
    )

    expect(html).toContain("Filter By County")
  })
})
