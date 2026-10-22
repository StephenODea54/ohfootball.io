// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { PlayoffMapCanvas } from "@/features/playoff-map/components/playoff-map-canvas"
import { division, shape } from "@/features/playoff-map/test/fixtures"

afterEach(cleanup)

const seeds = new Map([
  ["a", "a"],
  ["b", "b"],
  ["c", "c"],
  ["d", "d"],
])

function draw(owners: ReadonlyMap<string, string> = seeds) {
  return render(
    <PlayoffMapCanvas
      map={shape}
      division={division.division}
      regions={division.regions}
      owners={owners}
      detail={(team, region) => `detail ${team.id} ${region}`}
    />,
  )
}

const cells = (container: HTMLElement) => [...container.querySelectorAll("[data-cell]")]

describe("PlayoffMapCanvas", () => {
  it("draws the counties, a clip and a border for each region, and a cell for each team", () => {
    const { container } = draw()

    expect(container.querySelectorAll("clipPath[id$='-region-1'] path")).toHaveLength(1)
    expect(container.querySelectorAll("clipPath[id$='-region-2'] path")).toHaveLength(1)
    expect(cells(container).map((cell) => cell.getAttribute("data-cell"))).toEqual([
      "a",
      "b",
      "c",
      "d",
    ])
    expect(cells(container)[0].getAttribute("aria-label")).toBe("#1 School a")
    // The cells draw holes with the even-odd rule.
    expect(container.querySelector(".cell-fill")?.getAttribute("fill-rule")).toBe("evenodd")
  })

  it("draws a cell in the color of its owner with a dot at its own school", () => {
    const { container } = draw(new Map([...seeds, ["b", "a"]]))

    const taken = cells(container)[1]
    expect(taken.getAttribute("data-cell")).toBe("a")
    expect(taken.getAttribute("href")).toBe("/teams/a")
    // The dot of the cell stays at school b, at x 75.
    const dot = taken.querySelector("g[style]") as HTMLElement
    expect(dot.style.transform).toContain("translate(75px, 50px)")
  })

  it("shows the card of a team while the mouse points at its land, and hides it after", () => {
    const { container } = draw()
    const svg = container.querySelector("svg") as SVGSVGElement

    fireEvent.pointerOver(cells(container)[3], { pointerType: "mouse" })
    expect(screen.getByText("detail d 2")).toBeTruthy()
    expect(cells(container)[3].hasAttribute("data-active")).toBe(true)

    fireEvent.pointerOver(cells(container)[3], { pointerType: "touch" })
    expect(screen.getByText("detail d 2")).toBeTruthy()
    fireEvent.pointerLeave(svg, { pointerType: "touch" })
    expect(screen.getByText("detail d 2")).toBeTruthy()

    fireEvent.pointerLeave(svg, { pointerType: "mouse" })
    expect(screen.queryByText("detail d 2")).toBeNull()
  })

  it("shows the card on the first touch and follows the link on the second", () => {
    const { container } = draw()
    const land = cells(container)[0]

    const first = fireEvent.click(land)
    expect(first).toBe(false)
    expect(screen.getByText("detail a 1")).toBeTruthy()

    const second = fireEvent.click(land)
    expect(second).toBe(true)

    fireEvent.click(container.querySelector("svg") as SVGSVGElement)
    expect(screen.queryByText("detail a 1")).toBeNull()
  })
})
