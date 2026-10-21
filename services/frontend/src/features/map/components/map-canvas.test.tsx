// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MapCanvas } from "@/features/map/components/map-canvas"
import type { MapMarker } from "@/features/map/utils/markers"
import { wholeMap } from "@/features/map/utils/zoom"

afterEach(cleanup)

const map = {
  width: 1000,
  height: 1000,
  outline: "M0,0L1000,0L1000,1000Z",
  counties: [
    {
      name: "Stark",
      path: "M0,0L10,0L10,10Z",
      bounds: [0, 0, 10, 10] as [number, number, number, number],
    },
    {
      name: "Summit",
      path: "M20,0L30,0L30,10Z",
      bounds: [20, 0, 30, 10] as [number, number, number, number],
    },
  ],
}

function marker(id: string, x: number): MapMarker {
  // Stark covers 0 to 10 on each axis, so each school here is in Stark.
  return {
    id,
    sourceId: id,
    name: `School ${id}`,
    county: "Stark",
    division: 2,
    region: 7,
    rank: Number(id),
    rating: 10,
    x,
    y: 5,
    color: null,
  }
}

type CanvasProps = Parameters<typeof MapCanvas>[0]

function canvas(props: Partial<CanvasProps>, onSelectCounty: CanvasProps["onSelectCounty"]) {
  return (
    <MapCanvas
      map={map}
      tints={new Map([["Stark", "#CC0000"]])}
      selected={new Set(["Stark"])}
      filtered
      markers={[]}
      markersKey="none"
      target={wholeMap(map)}
      onSelectCounty={onSelectCounty}
      {...props}
    />
  )
}

function draw(props: Partial<CanvasProps> = {}) {
  const onSelectCounty = vi.fn()
  return { ...render(canvas(props, onSelectCounty)), onSelectCounty }
}

const cell = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-cell="${id}"]`) as Element
const cellFill = (container: HTMLElement, id: string) =>
  cell(container, id).querySelector(".cell-fill") as Element

const county = (container: HTMLElement, name: string) =>
  container.querySelector<SVGPathElement>(`[data-county="${name}"]`)

describe("MapCanvas", () => {
  it("draws each county in its tint and marks the chosen area", () => {
    const { container } = draw()

    const svg = container.querySelector("svg")
    expect(svg?.getAttribute("viewBox")).toBe("0 0 1000 1000")
    expect(svg?.getAttribute("data-filtered")).toBe("true")
    expect(county(container, "Stark")?.getAttribute("data-selected")).toBe("true")
    expect(county(container, "Summit")?.hasAttribute("data-selected")).toBe(false)
    expect(county(container, "Stark")?.style.getPropertyValue("--tint")).toBe("#CC0000")
    expect(county(container, "Summit")?.style.getPropertyValue("--tint")).toBe(
      "var(--color-muted-fg)",
    )
    expect(screen.queryAllByRole("link", { hidden: true })).toHaveLength(0)
  })

  it("does not fade any county with no filter", () => {
    const { container } = draw({ filtered: false, selected: new Set() })

    expect(container.querySelector("svg")?.hasAttribute("data-filtered")).toBe(false)
  })

  it("chooses a county from a click on it, and nothing from a click elsewhere", () => {
    const { container, onSelectCounty } = draw()

    fireEvent.click(county(container, "Summit") as SVGPathElement)
    expect(onSelectCounty).toHaveBeenCalledWith("Summit")

    fireEvent.click(container.querySelector("svg") as SVGSVGElement)
    expect(onSelectCounty).toHaveBeenCalledTimes(1)
  })

  it("splits the chosen area into a territory for each school", () => {
    const { container } = draw({ markers: [marker("2", 2), marker("1", 8)] })

    const svg = container.querySelector("svg") as SVGSVGElement
    expect(svg.getAttribute("data-cells")).toBe("true")
    expect(container.querySelectorAll("[data-cell]")).toHaveLength(2)
    const area = container.querySelector("defs clipPath")
    expect(area?.querySelectorAll("path")).toHaveLength(1)
    expect(container.querySelector("[data-cell]")?.parentElement?.getAttribute("clip-path")).toBe(
      `url(#${area?.id})`,
    )
    // The map is for the pointer only. The list of the page is the way for a keyboard and a
    // screen reader.
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true")
    expect(screen.queryAllByRole("link")).toHaveLength(0)
  })

  it("uses the whole state as the area when no county is chosen", () => {
    const { container } = draw({ selected: new Set(), markers: [marker("1", 5)] })

    expect(container.querySelectorAll("defs clipPath path")).toHaveLength(2)
  })

  it("shows the card of the territory that a mouse points at", () => {
    const { container } = draw({ markers: [marker("2", 2), marker("1", 8)] })
    const svg = container.querySelector("svg") as SVGSVGElement

    fireEvent.pointerOver(cellFill(container, "1"), { pointerType: "mouse" })
    expect(container.querySelector(".cell-card")?.textContent).toContain("School 1")
    expect(cell(container, "1").getAttribute("data-active")).toBe("true")
    fireEvent.pointerOver(cellFill(container, "1"), { pointerType: "mouse" })
    expect(cell(container, "1").getAttribute("data-active")).toBe("true")

    // A click with the mouse on the territory it points at opens the page.
    expect(fireEvent.click(cellFill(container, "1"))).toBe(true)

    fireEvent.pointerOver(county(container, "Summit") as SVGPathElement, { pointerType: "mouse" })
    expect(container.querySelector(".cell-card")).toBeNull()

    fireEvent.pointerOver(cellFill(container, "2"), { pointerType: "mouse" })
    fireEvent.pointerLeave(svg, { pointerType: "mouse" })
    expect(container.querySelector(".cell-card")).toBeNull()
  })

  it("shows the card on the first touch and opens the page on the second", () => {
    const { container } = draw({ markers: [marker("2", 2), marker("1", 8)] })
    const svg = container.querySelector("svg") as SVGSVGElement

    fireEvent.pointerOver(cellFill(container, "1"), { pointerType: "touch" })
    expect(container.querySelector(".cell-card")).toBeNull()

    expect(fireEvent.click(cellFill(container, "1"))).toBe(false)
    expect(container.querySelector(".cell-card")?.textContent).toContain("School 1")
    fireEvent.pointerLeave(svg, { pointerType: "touch" })
    expect(container.querySelector(".cell-card")).not.toBeNull()

    expect(fireEvent.click(cellFill(container, "1"))).toBe(true)
  })

  it("hides the card on a click outside the territories and on new filters", () => {
    const { container, rerender, onSelectCounty } = draw({
      markers: [marker("2", 2), marker("1", 8)],
    })

    fireEvent.click(cellFill(container, "1"))
    fireEvent.click(container.querySelector("svg") as SVGSVGElement)
    expect(container.querySelector(".cell-card")).toBeNull()
    expect(onSelectCounty).not.toHaveBeenCalled()

    fireEvent.click(cellFill(container, "1"))
    rerender(
      canvas({ markers: [marker("2", 2), marker("1", 8)], markersKey: "other" }, onSelectCounty),
    )
    expect(container.querySelector(".cell-card")).toBeNull()
  })

  it("draws every rank above all the territories and outside the clip of the area", () => {
    // A close view, so the two ranks have room.
    const { container } = draw({
      markers: [marker("2", 2), marker("1", 8)],
      target: { x: 0, y: 0, width: 10, height: 10 },
    })

    const ranks = container.querySelector("rect")?.closest("g.pointer-events-none")
    const cellsLayer = container.querySelector("[data-cell]")?.parentElement
    expect(ranks?.previousElementSibling).toBe(cellsLayer)
    expect(ranks?.hasAttribute("clip-path")).toBe(false)
    expect(
      [...container.querySelectorAll("rect")].map((rect) => rect.nextElementSibling?.textContent),
    ).toEqual(expect.arrayContaining(["#1", "#2"]))
  })

  it("shows the rank of a school outside the area at the school", () => {
    const { container } = draw({ markers: [marker("2", 2), { ...marker("1", 8), x: 90, y: 90 }] })

    const badges = [...container.querySelectorAll("rect")].map(
      (rect) => (rect.parentElement as unknown as SVGGElement).style.transform,
    )
    expect(badges.some((transform) => transform.startsWith("translate(90px, 90px)"))).toBe(true)
  })

  it("lays the map out again when its width changes", () => {
    const observers: (() => void)[] = []
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          observers.push(callback)
        }
        observe() {}
        disconnect() {}
      },
    )
    let width = 1000
    const measure = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(() => ({ width }) as DOMRect)
    const { container } = draw({ markers: [marker("2", 2), marker("1", 8)] })
    const blur = () => container.querySelector("feGaussianBlur")?.getAttribute("stdDeviation")
    expect(blur()).toBe("7")

    width = 500
    act(() => observers[0]())
    expect(blur()).toBe("14")
    measure.mockRestore()
    vi.unstubAllGlobals()
  })
})
