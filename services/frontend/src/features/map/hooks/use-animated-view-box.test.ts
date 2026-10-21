// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useAnimatedViewBox } from "@/features/map/hooks/use-animated-view-box"
import { interpolateViewBox, type ViewBox, viewBoxAttribute } from "@/features/map/utils/zoom"

const whole: ViewBox = { x: 0, y: 0, width: 1000, height: 1000 }
const corner: ViewBox = { x: 600, y: 100, width: 300, height: 300 }

/** Frames that run only when the test says so. */
let frames: Map<number, FrameRequestCallback>
let nextFrame: number

function runFrame(now: number) {
  const due = [...frames.values()]
  frames.clear()
  act(() => {
    for (const callback of due) callback(now)
  })
}

beforeEach(() => {
  frames = new Map()
  nextFrame = 1
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(nextFrame, callback)
    return nextFrame++
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function setup(reducedMotion = false) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("viewBox", viewBoxAttribute(whole))
  const setAttribute = vi.spyOn(svg, "setAttribute")
  const ref = { current: svg }
  const hook = renderHook(
    ({ target, width }) => useAnimatedViewBox(ref, target, { start: whole, width, reducedMotion }),
    { initialProps: { target: whole, width: 500 } },
  )
  return { svg, setAttribute, ...hook }
}

describe("useAnimatedViewBox", () => {
  it("writes the first view and the map units of one pixel without a frame", () => {
    const { svg } = setup()

    expect(svg.getAttribute("viewBox")).toBe("0 0 1000 1000")
    expect(svg.style.getPropertyValue("--map-px")).toBe("2")
    expect(frames.size).toBe(0)
  })

  it("zooms to a new target with one write of the view per frame", () => {
    const { svg, setAttribute, rerender } = setup()
    setAttribute.mockClear()
    const zoom = interpolateViewBox(whole, corner)

    rerender({ target: corner, width: 500 })
    runFrame(1000)
    expect(svg.getAttribute("viewBox")).toBe("0 0 1000 1000")
    runFrame(1000 + zoom.durationMs / 2)
    const viewWrites = setAttribute.mock.calls.filter(([name]) => name === "viewBox")
    expect(viewWrites).toHaveLength(2)
    const middle = svg.getAttribute("viewBox")?.split(" ").map(Number) ?? []
    expect(middle[2]).toBeLessThan(1000)
    expect(middle[2]).toBeGreaterThan(300)

    expect(svg.hasAttribute("data-zooming")).toBe(true)

    runFrame(1000 + zoom.durationMs)
    expect(svg.hasAttribute("data-zooming")).toBe(false)
    expect(svg.getAttribute("viewBox")).toBe("600 100 300 300")
    expect(svg.style.getPropertyValue("--map-px")).toBe("0.6")
    expect(frames.size).toBe(0)
  })

  it("starts a new zoom from the view on the screen and stops the old one", () => {
    const { svg, rerender } = setup()
    rerender({ target: corner, width: 500 })
    runFrame(0)
    runFrame(200)
    const halfway = svg.getAttribute("viewBox")

    rerender({ target: whole, width: 500 })
    expect(frames.size).toBe(1)
    runFrame(300)
    expect(svg.getAttribute("viewBox")).toBe(halfway)
    runFrame(5000)
    expect(svg.getAttribute("viewBox")).toBe("0 0 1000 1000")
  })

  it("jumps to the target when the visitor asks for less motion", () => {
    const { svg, rerender } = setup(true)

    rerender({ target: corner, width: 500 })
    expect(frames.size).toBe(0)
    expect(svg.getAttribute("viewBox")).toBe("600 100 300 300")
    expect(svg.hasAttribute("data-zooming")).toBe(false)
  })

  it("follows a new width without a zoom", () => {
    const { svg, rerender } = setup()

    rerender({ target: whole, width: 250 })
    expect(frames.size).toBe(0)
    expect(svg.style.getPropertyValue("--map-px")).toBe("4")
  })

  it("cancels a zoom when it unmounts", () => {
    const { svg, rerender, unmount } = setup()
    rerender({ target: corner, width: 500 })
    expect(frames.size).toBe(1)

    unmount()
    expect(frames.size).toBe(0)
    expect(svg.hasAttribute("data-zooming")).toBe(false)
  })

  it("does nothing without an SVG", () => {
    const ref = { current: null }
    const { rerender } = renderHook(
      ({ target }) =>
        useAnimatedViewBox(ref, target, { start: whole, width: 500, reducedMotion: false }),
      { initialProps: { target: whole } },
    )

    rerender({ target: corner })
    expect(frames.size).toBe(0)
  })
})
