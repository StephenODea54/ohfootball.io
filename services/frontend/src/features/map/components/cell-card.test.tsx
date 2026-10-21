// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { CellCard, cardPlacement } from "@/features/map/components/cell-card"
import type { MapMarker } from "@/features/map/utils/markers"

afterEach(cleanup)

const marker: MapMarker = {
  id: "a",
  sourceId: "842",
  name: "Archbishop Hoban",
  county: "Summit",
  division: 2,
  region: 5,
  rank: 12,
  rating: 52.7,
  x: 0,
  y: 0,
  color: null,
}

describe("cardPlacement", () => {
  it("centers the card on its point, inside the box", () => {
    expect(cardPlacement({ x: 300, y: 400 }, 640)).toEqual({ left: 300, top: 400, below: false })
    expect(cardPlacement({ x: 10, y: 400 }, 640).left).toBe(120)
    expect(cardPlacement({ x: 630, y: 400 }, 640).left).toBe(520)
    expect(cardPlacement({ x: 100, y: 400 }, 200).left).toBe(120)
  })

  it("puts the card below a point near the top", () => {
    expect(cardPlacement({ x: 300, y: 80 }, 640).below).toBe(true)
  })
})

describe("CellCard", () => {
  it("shows the school with its place, rank, and rating, hidden from screen readers", () => {
    const { container } = render(
      <CellCard
        marker={{ ...marker, color: "#CC0000" }}
        anchor={{ x: 300, y: 80 }}
        boxWidth={640}
      />,
    )

    const card = container.firstElementChild as HTMLElement
    expect(card.getAttribute("aria-hidden")).toBe("true")
    expect(card.getAttribute("data-below")).toBe("true")
    expect(card.style.getPropertyValue("--card-x")).toBe("300px")
    expect(card.style.getPropertyValue("--tint")).toBe("#CC0000")
    expect(screen.getByText("Summit · D-II · Region 5")).toBeTruthy()
    expect(screen.getByText("#12 · +52.7")).toBeTruthy()
    expect(screen.getByText("Tap again to open")).toBeTruthy()
  })

  it("uses gray for a school with no color", () => {
    const { container } = render(
      <CellCard marker={marker} anchor={{ x: 300, y: 400 }} boxWidth={640} />,
    )

    const card = container.firstElementChild as HTMLElement
    expect(card.hasAttribute("data-below")).toBe(false)
    expect(card.style.getPropertyValue("--tint")).toBe("var(--color-muted-fg)")
  })
})
