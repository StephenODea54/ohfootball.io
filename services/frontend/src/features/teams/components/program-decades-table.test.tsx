import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ProgramDecadesTable } from "@/features/teams/components/program-decades-table"
import { type DecadeRow, decadeRows, toSeasonRows } from "@/features/teams/utils/program-history"
import { massillonHistory, massillonName } from "@/test/massillon-history"

const massillon = toSeasonRows({
  season: 2026,
  programHistory: massillonHistory,
})

function render(decades: DecadeRow[]) {
  return renderToStaticMarkup(<ProgramDecadesTable team={{ name: massillonName, decades }} />)
}

describe("ProgramDecadesTable", () => {
  it("shows a row for each decade", () => {
    const html = render(decadeRows(massillon))

    expect(html).toContain('aria-label="Massillon Washington By Decade"')
    expect(html).toContain('aria-label="About By Decade"')
    expect(html).toContain(">Playoff Appearances<")
    expect(html).not.toContain('data-slot="card-description"')
    for (const decade of ["2020s", "2010s", "2000s", "1990s", "1980s", "1970s"]) {
      expect(html).toContain(`>${decade}<`)
    }
  })

  it("shows a dash for a decade without a qualifying season", () => {
    const decade = {
      seasons: 1,
      record: { wins: 1, losses: 1, ties: 0 },
      playoffAppearances: 0,
      medianRank: null,
      bestRank: null,
    }
    const html = render([
      { ...decade, id: "2020s" },
      { ...decade, id: "2010s" },
    ])

    expect(html.match(/—/g)).toHaveLength(4)
  })

  it("shows nothing for one decade", () => {
    expect(render(decadeRows(massillon).slice(0, 1))).toBe("")
    expect(render([])).toBe("")
  })
})
