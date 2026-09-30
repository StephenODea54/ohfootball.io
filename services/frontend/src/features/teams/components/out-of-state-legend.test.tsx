import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { OutOfStateLegend } from "@/features/teams/components/out-of-state-legend"

describe("OutOfStateLegend", () => {
  it("tells what the mark means when a school has it", () => {
    const html = renderToStaticMarkup(
      <OutOfStateLegend
        teams={[{ outOfStateGamesPlayed: 0 }, { outOfStateGamesPlayed: 2 }]}
        className="mt-3"
      />,
    )

    expect(html).toContain("2 or more games against out-of-state teams")
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain("mt-3")
  })

  it("shows nothing when no school has the mark", () => {
    expect(renderToStaticMarkup(<OutOfStateLegend teams={[{ outOfStateGamesPlayed: 1 }]} />)).toBe(
      "",
    )
    expect(renderToStaticMarkup(<OutOfStateLegend teams={[]} />)).toBe("")
  })
})
