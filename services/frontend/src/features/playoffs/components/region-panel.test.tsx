// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RegionPanel } from "@/features/playoffs/components/region-panel"

const map = {
  width: 400,
  height: 420,
  outline: "M0,0Z",
  shapes: [
    { region: 9, path: "M1,1Z", label: { x: 10, y: 10 } },
    { region: 10, path: "M2,2Z", label: { x: 20, y: 20 } },
  ],
}

afterEach(cleanup)

describe("RegionPanel", () => {
  it("marks the chosen region on the map", () => {
    const html = renderToStaticMarkup(
      <RegionPanel region={10} division={3} map={map} onSelect={() => {}} />,
    )

    expect(html).toContain("Region 10")
    expect(html).toContain('<nav aria-label="Map of the Division III regions"')
    expect(html).toMatch(/d="M2,2Z" class="[^"]*fill-primary/)
    expect(html).toMatch(/d="M1,1Z" class="[^"]*fill-muted/)
  })

  it("links each region to its odds and marks the chosen one as the page", () => {
    render(<RegionPanel region={10} division={3} map={map} onSelect={() => {}} />)

    const nine = screen.getByRole("link", { name: "Region 9" })
    const ten = screen.getByRole("link", { name: "Region 10" })
    expect(nine.getAttribute("href")).toBe("?division=3&region=9")
    expect(nine.getAttribute("aria-current")).toBeNull()
    expect(ten.getAttribute("aria-current")).toBe("page")
  })

  it("chooses a region on a plain click and stays on the page", () => {
    const onSelect = vi.fn()
    render(<RegionPanel region={10} division={3} map={map} onSelect={onSelect} />)

    const allowed = fireEvent.click(screen.getByRole("link", { name: "Region 9" }))

    expect(allowed).toBe(false)
    expect(onSelect).toHaveBeenCalledWith(9)
  })

  it.each([
    { metaKey: true },
    { ctrlKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
  ])("leaves a click with %o to the browser", (init) => {
    const onSelect = vi.fn()
    render(<RegionPanel region={10} division={3} map={map} onSelect={onSelect} />)

    const allowed = fireEvent.click(screen.getByRole("link", { name: "Region 9" }), init)

    expect(allowed).toBe(true)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("leaves out the map when the build has none", () => {
    const html = renderToStaticMarkup(
      <RegionPanel region={3} division={1} map={null} onSelect={() => {}} />,
    )

    expect(html).toContain("Region 3")
    expect(html).not.toContain("<svg")
  })
})
