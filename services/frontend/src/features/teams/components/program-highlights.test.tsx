import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ProgramHighlights } from "@/features/teams/components/program-highlights"
import { type SeasonRow, toSeasonRows } from "@/features/teams/utils/program-history"
import { massillonHistory } from "@/test/massillon-history"

const massillon = toSeasonRows({
  season: 2026,
  programHistory: massillonHistory,
})

function row(overrides: Partial<SeasonRow>): SeasonRow {
  return {
    season: 2024,
    record: { wins: 5, losses: 5, ties: 0 },
    playoffRecord: { wins: 0, losses: 0, ties: 0 },
    rating: 3,
    rank: 200,
    inProgress: false,
    ...overrides,
  }
}

describe("ProgramHighlights", () => {
  it("shows the four numbers of Massillon, with the rating next to each season", () => {
    const html = renderToStaticMarkup(<ProgramHighlights rows={massillon} />)

    expect(html).toContain("Best Season</dt><dd")
    expect(html).toMatch(
      /<span class="flex items-center gap-2">2023<span class="[^"]*text-success-subtle-fg[^"]*">\+65<\/span><\/span><\/dd>/,
    )
    expect(html).toMatch(/>2015<span class="[^"]*">\+25<\/span><\/span><\/dd>/)
    expect(html).toContain("Top 10 Finishes</dt>")
    expect(html).toContain(">27</dd>")
    expect(html).toContain("Playoff Appearances</dt>")
    expect(html).toContain(">32</dd>")
    expect(html.match(/<dd/g)).toHaveLength(4)
  })

  it("puts an info button next to the title, without a description", () => {
    const html = renderToStaticMarkup(<ProgramHighlights rows={massillon} />)

    expect(html).toContain('aria-label="About Highlights"')
    expect(html).not.toContain('data-slot="card-description"')
  })

  it("shows dashes for an empty history", () => {
    const html = renderToStaticMarkup(<ProgramHighlights rows={[]} />)

    expect(html.match(/>—<\/dd>/g)).toHaveLength(4)
  })

  it("shows dashes for the ranks when no season qualifies, and counts the playoffs", () => {
    const html = renderToStaticMarkup(
      <ProgramHighlights
        rows={[
          row({ record: { wins: 1, losses: 2, ties: 0 } }),
          row({ season: 2026, inProgress: true }),
        ]}
      />,
    )

    expect(html.match(/>—<\/dd>/g)).toHaveLength(3)
    expect(html).toContain(">0</dd>")
  })
})
