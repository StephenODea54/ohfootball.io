import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ProgramSeasonsTable } from "@/features/teams/components/program-seasons-table"
import { toSeasonRows } from "@/features/teams/utils/program-history"
import { massillonHistory, massillonName } from "@/test/massillon-history"

const massillon = toSeasonRows({
  season: 2026,
  programHistory: massillonHistory,
})

function render(rows = massillon) {
  return renderToStaticMarkup(<ProgramSeasonsTable team={{ name: massillonName, rows }} />)
}

describe("ProgramSeasonsTable", () => {
  it("shows the 10 newest seasons and a button to show all of them", () => {
    const html = render()

    expect(html).toContain('aria-label="Massillon Washington Seasons"')
    expect(html).toContain(">Show More<")
    expect(html).toContain(">Playoff Record<")
    expect(html).not.toContain('data-slot="card-description"')
    expect(html).toContain(">2026")
    expect(html).toContain(">2017")
    expect(html).not.toContain(">2016")
    expect(html).toContain("In Progress")
    expect(html).toContain(">#4<")
    expect(html).not.toContain(" of ")
  })

  it("shows no button for a short history, and no name of a season", () => {
    const rows = massillon.filter((row) => row.season >= 1999 && row.season <= 2006)
    const html = render(rows)

    expect(rows).toHaveLength(8)
    expect(html).not.toContain("Show More")
    expect(html).not.toContain(">as ")
    expect(html).not.toContain("In Progress")
    expect(html).toContain("3–1")
  })

  it("shows dashes for a season without a rating or a playoff game", () => {
    const html = render([
      {
        season: 2020,
        record: { wins: 0, losses: 0, ties: 0 },
        playoffRecord: { wins: 0, losses: 0, ties: 0 },
        rating: null,
        rank: null,
        inProgress: false,
      },
    ])

    expect(html.match(/—/g)).toHaveLength(3)
  })
})
