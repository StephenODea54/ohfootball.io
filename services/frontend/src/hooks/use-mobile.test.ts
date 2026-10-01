// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react"
import type { Window as HappyWindow } from "happy-dom"
import { afterEach, describe, expect, it } from "vitest"
import { useIsMobile } from "@/hooks/use-mobile"

afterEach(cleanup)

/** Sets the window width and tells the media queries that it changed. */
function resize(width: number) {
  act(() => {
    ;(window as unknown as HappyWindow).happyDOM.setInnerWidth(width)
  })
}

describe("useIsMobile", () => {
  it("is true below the default breakpoint of 768 pixels", () => {
    resize(767)
    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(true)
  })

  it("is false at the default breakpoint", () => {
    resize(768)
    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(false)
  })

  it("uses the breakpoint that the caller gives", () => {
    resize(900)
    const { result } = renderHook(() => useIsMobile(1024))

    expect(result.current).toBe(true)
  })

  it("follows the window when it changes width", () => {
    resize(1200)
    const { result } = renderHook(() => useIsMobile(1024))
    expect(result.current).toBe(false)

    resize(1000)
    expect(result.current).toBe(true)

    resize(1100)
    expect(result.current).toBe(false)
  })
})
