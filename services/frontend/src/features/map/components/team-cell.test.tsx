// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { TeamCell, TeamPill } from "@/features/map/components/team-cell"
import type { CellLayout } from "@/features/map/utils/cell-layout"
import type { MapMarker } from "@/features/map/utils/markers"
import type { Territory } from "@/features/map/utils/territories"

afterEach(cleanup)

// 842 has a logo file. 1 does not.
const marker: MapMarker = {
  id: "hoban-key",
  sourceId: "842",
  name: "Archbishop Hoban",
  county: "Summit",
  division: 2,
  region: 5,
  rank: 12,
  rating: 52.7,
  x: 30,
  y: 40,
  color: "#1E90FF",
}

const territory: Territory = {
  id: "hoban-key",
  polygon: [],
  path: "M0,0L100,0L100,100Z",
  circle: { x: 50, y: 60, r: 30 },
}

function draw(
  overrides: Partial<MapMarker> = {},
  layout: CellLayout = { logo: { size: 40, file: "small" }, compactPill: false },
  active = false,
) {
  return render(
    <svg>
      <title>Test map</title>
      <TeamCell
        marker={{ ...marker, ...overrides }}
        territory={territory}
        layout={layout}
        clipId="clip-1"
        glowId="glow-1"
        active={active}
      />
    </svg>,
  )
}

describe("TeamCell", () => {
  it("is a link out of the tab order to the page of the team", () => {
    const { container } = draw()

    const link = container.querySelector("a") as unknown as SVGAElement
    expect(link.getAttribute("href")).toBe("/teams/hoban-key")
    expect(link.getAttribute("tabindex")).toBe("-1")
    expect(link.getAttribute("aria-label")).toBe("#12 Archbishop Hoban")
    expect(link.getAttribute("data-cell")).toBe("hoban-key")
    expect(link.hasAttribute("data-active")).toBe(false)
    expect(link.style.getPropertyValue("--tint")).toBe("#1E90FF")
  })

  it("draws the territory, a glow clipped to it, the logo clipped to it, and the school", () => {
    const { container } = draw()

    expect(container.querySelector("clipPath#clip-1 path")?.getAttribute("d")).toBe(territory.path)
    const glow = container.querySelectorAll(".cell-glow path")
    expect(glow).toHaveLength(1)
    expect(glow[0].getAttribute("filter")).toBe("url(#glow-1)")
    expect(glow[0].getAttribute("stroke-width")).toBe("3")
    expect(container.querySelector(".cell-glow")?.getAttribute("clip-path")).toBe("url(#clip-1)")
    const logo = container.querySelector("image")
    expect(logo?.getAttribute("href")).toBe("/logos/842-80.webp")
    expect(logo?.getAttribute("x")).toBe("30")
    expect(logo?.parentElement?.getAttribute("clip-path")).toBe("url(#clip-1)")
    expect(container.querySelector("rect")).toBeNull()
    const dot = container.querySelector("circle")?.parentElement as unknown as SVGGElement
    expect(dot.style.transform).toBe("translate(30px, 40px) scale(calc(var(--map-px, 1) * 1))")
  })

  it("shows the initials of a school with no logo, and gray for no color", () => {
    const { container } = draw(
      { sourceId: "1", color: null },
      { logo: { size: 40, file: "large" }, compactPill: false },
    )

    expect(container.querySelector("image")).toBeNull()
    expect(container.querySelector(".cell-logo")?.textContent).toBe("AH")
    const link = container.querySelector("a") as unknown as SVGAElement
    expect(link.style.getPropertyValue("--tint")).toBe("var(--color-muted-fg)")
  })

  it("draws no logo in a territory with no room for one, and marks the active territory", () => {
    const { container } = draw({}, { logo: null, compactPill: true }, true)

    expect(container.querySelector(".cell-logo")).toBeNull()
    expect(container.querySelector("a")?.getAttribute("data-active")).toBe("true")
  })
})

describe("TeamPill", () => {
  function pill(compact: boolean) {
    return render(
      <svg>
        <title>Test map</title>
        <TeamPill rank={12} at={{ x: 50, y: 76 }} compact={compact} />
      </svg>,
    )
  }

  it("hangs the rank below its point at the scale of one pixel", () => {
    const { container } = pill(false)

    const badge = container.querySelector("g") as SVGGElement
    expect(badge.style.transform).toBe("translate(50px, 76px) scale(calc(var(--map-px, 1) * 1))")
    expect(container.querySelector("rect")?.getAttribute("y")).toBe("0")
    expect(container.querySelector("text")?.textContent).toBe("#12")
  })

  it("is smaller in a small territory", () => {
    const { container } = pill(true)

    const badge = container.querySelector("g") as SVGGElement
    expect(badge.style.transform).toBe("translate(50px, 76px) scale(calc(var(--map-px, 1) * 0.85))")
  })
})
