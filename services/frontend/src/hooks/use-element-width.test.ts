// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FALLBACK_WIDTH, useElementWidth } from "@/hooks/use-element-width"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** An element whose width the test can change. */
function element(start: number) {
  const node = document.createElement("div")
  const size = { width: start }
  node.getBoundingClientRect = () => ({ width: size.width }) as DOMRect
  return { ref: { current: node }, size }
}

/** A ResizeObserver that runs its callback only when the test says so. */
function fakeObserver() {
  const observers: { callback: () => void; observed: Element[]; disconnected: boolean }[] = []
  vi.stubGlobal(
    "ResizeObserver",
    class {
      entry: (typeof observers)[number]
      constructor(callback: () => void) {
        this.entry = { callback, observed: [], disconnected: false }
        observers.push(this.entry)
      }
      observe(target: Element) {
        this.entry.observed.push(target)
      }
      disconnect() {
        this.entry.disconnected = true
      }
    },
  )
  return observers
}

describe("useElementWidth", () => {
  it("measures the element and follows a change of its size", () => {
    const observers = fakeObserver()
    const { ref, size } = element(812)
    const { result, unmount } = renderHook(() => useElementWidth(ref))
    expect(result.current).toBe(812)
    expect(observers[0].observed).toEqual([ref.current])

    size.width = 400
    act(() => observers[0].callback())
    expect(result.current).toBe(400)

    unmount()
    expect(observers[0].disconnected).toBe(true)
  })

  it("falls back when there is no element or it has no width", () => {
    fakeObserver()
    expect(renderHook(() => useElementWidth({ current: null })).result.current).toBe(FALLBACK_WIDTH)
    expect(renderHook(() => useElementWidth(element(0).ref)).result.current).toBe(FALLBACK_WIDTH)
  })

  it("follows the window in a browser without ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined)
    const { ref, size } = element(500)
    const { result } = renderHook(() => useElementWidth(ref))
    expect(result.current).toBe(500)

    size.width = 320
    act(() => {
      window.dispatchEvent(new Event("resize"))
    })
    expect(result.current).toBe(320)
  })
})
