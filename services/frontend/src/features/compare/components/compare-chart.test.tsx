// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react"
import { cloneElement, type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CompareChart } from "@/features/compare/components/compare-chart"
import type { SlotStyles } from "@/features/compare/components/slot-colors"
import type { CompareRow } from "@/features/compare/utils/season-series"

// The test page has no layout, so the container gives the chart a fixed size.
vi.mock("recharts", async (original) => ({
  ...(await original<typeof import("recharts")>()),
  ResponsiveContainer: ({
    children,
  }: {
    children: ReactElement<{ width: number; height: number }>
  }) => cloneElement(children, { width: 600, height: 300 }),
}))

const styles: SlotStyles = {
  a: { light: "#b87600", dark: "#ffa500", dash: undefined },
  b: { light: "#fb0000", dark: "#ff0000", dash: "6 3" },
}

const rows: CompareRow[] = [
  { season: 2024, a: 18, b: 4, rankA: 20, rankB: 300 },
  { season: 2025, a: 20, b: 6, rankA: 15, rankB: 250 },
]

function chart(lineStyles: SlotStyles = styles) {
  return (
    <CompareChart
      rows={rows}
      nameA="Massillon Washington"
      nameB="Canton McKinley"
      styles={lineStyles}
      seasonLabel={String}
    />
  )
}

/** The CSS rules that the chart writes for each theme. */
function themeRules(lineStyles?: SlotStyles) {
  const html = renderToStaticMarkup(chart(lineStyles))
  const css = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ""
  const [light = "", dark = ""] = css.split(".dark ")
  return { light, dark }
}

afterEach(() => {
  cleanup()
})

describe("CompareChart", () => {
  it("writes the color of each line for each theme", () => {
    const { light, dark } = themeRules()

    expect(light).toContain("--color-a: #b87600;")
    expect(light).toContain("--color-b: #fb0000;")
    expect(dark).toMatch(/^\[data-chart=/)
    expect(dark).toContain("--color-a: #ffa500;")
    expect(dark).toContain("--color-b: #ff0000;")
  })

  it("writes a token of the site as it is", () => {
    const token = "var(--color-warning-subtle-fg)"
    const { light, dark } = themeRules({ ...styles, b: { light: token, dark: token, dash: "6 3" } })

    expect(light).toContain(`--color-b: ${token};`)
    expect(dark).toContain(`--color-b: ${token};`)
  })

  it("draws a solid line for a and a dashed line for b in the colors of the chart", async () => {
    const { container } = render(chart())
    // Recharts draws the lines after the first effects.
    await act(async () => {})

    const [lineA, lineB] = container.querySelectorAll(".recharts-line-curve")
    expect(lineA?.getAttribute("stroke")).toBe("var(--color-a)")
    expect(lineA?.hasAttribute("stroke-dasharray")).toBe(false)
    expect(lineB?.getAttribute("stroke")).toBe("var(--color-b)")
    expect(lineB?.getAttribute("stroke-dasharray")).toBe("6 3")
  })

  it("names both schools in the label of the image", () => {
    expect(renderToStaticMarkup(chart())).toContain(
      'aria-label="End of season rating of Massillon Washington and Canton McKinley, 2024 to 2025"',
    )
  })
})
