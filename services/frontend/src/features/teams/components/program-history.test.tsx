import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ProgramHistory } from "@/features/teams/components/program-history"
import { toSeasonRows } from "@/features/teams/utils/program-history"
import { massillonHistory, massillonName } from "@/test/massillon-history"

describe("ProgramHistory", () => {
  it("draws the highlights, the seasons, and the decades", () => {
    const rows = toSeasonRows({
      season: 2026,
      programHistory: massillonHistory,
    })
    const html = renderToStaticMarkup(<ProgramHistory team={{ name: massillonName, rows }} />)

    expect(html.indexOf("Highlights")).toBeLessThan(html.indexOf("Massillon Washington Seasons"))
    expect(html.indexOf("Massillon Washington Seasons")).toBeLessThan(
      html.indexOf("Massillon Washington By Decade"),
    )
  })
})
