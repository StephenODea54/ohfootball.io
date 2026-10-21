// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { TeamMap } from "@/features/map/components/team-map"
import type { MapMarker } from "@/features/map/utils/markers"

type Box = [number, number, number, number]

const map = {
  width: 1000,
  height: 1000,
  outline: "M0,0Z",
  counties: [
    { name: "Franklin", path: "M400,500Z", bounds: [400, 500, 500, 600] as Box },
    { name: "Stark", path: "M700,300Z", bounds: [680, 280, 740, 340] as Box },
    { name: "Summit", path: "M650,250Z", bounds: [620, 220, 680, 280] as Box },
  ],
  regions: { 2: [8, 7, 7], 3: [11, 9, 9] },
}

function marker(
  id: string,
  rank: number,
  county: string,
  division: number,
  region: number,
  x = 500,
): MapMarker {
  return {
    id,
    sourceId: id,
    name: `School ${id}`,
    county,
    division,
    region,
    rank,
    rating: 50 - rank,
    x,
    y: 500,
    color: null,
  }
}

const markers = [
  marker("d", 40, "Franklin", 2, 8, 450),
  marker("b", 20, "Stark", 3, 9, 700),
  marker("c", 10, "Summit", 2, 7, 650),
  marker("a", 1, "Stark", 2, 7, 710),
]

beforeEach(() => {
  window.history.replaceState(null, "", "/map")
})

afterEach(cleanup)

const svg = (container: HTMLElement) => container.querySelector("svg.team-map") as SVGSVGElement
const county = (container: HTMLElement, name: string) =>
  container.querySelector(`[data-county="${name}"]`) as SVGPathElement

describe("TeamMap", () => {
  it("shows only the counties with no filter", () => {
    const { container } = render(<TeamMap map={map} markers={markers} />)

    expect(screen.getByText(/Choose a division, a region, or a county/)).toBeTruthy()
    expect(container.querySelectorAll("[data-cell]")).toHaveLength(0)
    expect(svg(container).hasAttribute("data-filtered")).toBe(false)
    expect(screen.queryByRole("grid")).toBeNull()
  })

  it("reads the filters of a link and writes back the ones that it kept", async () => {
    window.history.replaceState(null, "", "/map?division=2&region=7&county=nowhere")
    const { container } = render(<TeamMap map={map} markers={markers} />)

    await waitFor(() => expect(screen.getByText("2 rated schools")).toBeTruthy())
    expect(window.location.search).toBe("?division=2&region=7")
    expect(screen.getByRole("grid", { name: "Rated schools: Division II, Region 7" })).toBeTruthy()
    expect(container.querySelectorAll("[data-cell]")).toHaveLength(2)
    expect(county(container, "Stark").hasAttribute("data-selected")).toBe(true)
    expect(county(container, "Franklin").hasAttribute("data-selected")).toBe(false)
  })

  it("clears a region from a link when the county lies outside it, and keeps the hash", async () => {
    window.history.replaceState(null, "", "/map?division=2&region=7&county=Franklin#top")
    render(<TeamMap map={map} markers={markers} />)

    await waitFor(() => expect(screen.getByText("1 rated school")).toBeTruthy())
    expect(window.location.search).toBe("?division=2&county=Franklin")
    expect(window.location.hash).toBe("#top")
  })

  it("uses the last value of a filter given twice", async () => {
    window.history.replaceState(null, "", "/map?county=Franklin&county=Stark")
    render(<TeamMap map={map} markers={markers} />)

    await waitFor(() => expect(screen.getByText("2 rated schools")).toBeTruthy())
    expect(window.location.search).toBe("?county=Stark")
  })

  it("keeps an address that it already shows", async () => {
    window.history.replaceState(null, "", "/map?county=Stark")
    render(<TeamMap map={map} markers={markers} />)

    await waitFor(() => expect(screen.getByText("2 rated schools")).toBeTruthy())
    expect(screen.getByText("Stark County. Ranks are for the whole state.")).toBeTruthy()
    expect(window.location.search).toBe("?county=Stark")
  })

  it("stacks the filters and says when no school matches", async () => {
    window.history.replaceState(null, "", "/map?division=3&county=Summit")
    render(<TeamMap map={map} markers={markers} />)

    await waitFor(() => expect(screen.getByText("0 rated schools")).toBeTruthy())
    expect(screen.getByText(/No rated school matches these filters/)).toBeTruthy()
  })

  it("chooses a division, then a county from the map, then clears the county with a second click", async () => {
    const { container } = render(<TeamMap map={map} markers={markers} />)

    fireEvent.click(screen.getByRole("button", { name: /Division/ }))
    fireEvent.click(await screen.findByRole("option", { name: "Division II" }))
    expect(window.location.search).toBe("?division=2")
    expect(screen.getByText("3 rated schools")).toBeTruthy()

    fireEvent.click(county(container, "Stark"))
    expect(window.location.search).toBe("?division=2&county=Stark")
    expect(screen.getByText("1 rated school")).toBeTruthy()

    fireEvent.click(county(container, "Stark"))
    expect(window.location.search).toBe("?division=2")
  })

  it("chooses a region and its division, and clears every filter", async () => {
    window.history.replaceState(null, "", "/map#teams")
    render(<TeamMap map={map} markers={markers} />)

    fireEvent.click(screen.getByRole("button", { name: /Region/ }))
    fireEvent.click(await screen.findByRole("option", { name: "Region 9 · Division III" }))
    expect(window.location.search).toBe("?division=3&region=9")

    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(window.location.search).toBe("")
    expect(window.location.hash).toBe("#teams")
    expect(screen.getByText(/Choose a division, a region, or a county/)).toBeTruthy()
  })

  it("chooses a county from the county field", async () => {
    render(<TeamMap map={map} markers={markers} />)

    const input = screen.getByRole("combobox", { name: "County" })
    input.focus()
    fireEvent.change(input, { target: { value: "Fra" } })
    fireEvent.click(await screen.findByRole("option", { name: "Franklin" }))

    expect(window.location.search).toBe("?county=Franklin")
  })

  it("keeps the other names of the query string", async () => {
    window.history.replaceState(null, "", "/map?utm_source=news&county=stark")
    render(<TeamMap map={map} markers={markers} />)

    await waitFor(() => expect(screen.getByText("2 rated schools")).toBeTruthy())
    expect(window.location.search).toBe("?utm_source=news&county=Stark")
  })

  it("draws no hint before the page reads the address", () => {
    const html = renderToStaticMarkup(<TeamMap map={map} markers={markers} />)

    expect(html).not.toContain("Choose a division")
  })
})
