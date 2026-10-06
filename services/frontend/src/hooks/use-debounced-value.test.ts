// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isBlank, useDebouncedValue } from "@/hooks/use-debounced-value"

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** Moves the fake clock forward by the given number of milliseconds. */
function wait(milliseconds: number) {
  act(() => {
    vi.advanceTimersByTime(milliseconds)
  })
}

function renderDebounced(value: string, delayMs?: number) {
  return renderHook(({ text }) => useDebouncedValue(text, { delayMs, applyAtOnce: isBlank }), {
    initialProps: { text: value },
  })
}

describe("useDebouncedValue", () => {
  it("gives the first value at once", () => {
    const { result } = renderHook(() => useDebouncedValue("a"))

    expect(result.current).toBe("a")
  })

  it("keeps the old value until the default delay of 200 milliseconds passes", () => {
    const { result, rerender } = renderHook(({ text }) => useDebouncedValue(text), {
      initialProps: { text: "a" },
    })

    rerender({ text: "ab" })
    expect(result.current).toBe("a")

    wait(199)
    expect(result.current).toBe("a")

    wait(1)
    expect(result.current).toBe("ab")
  })

  it("starts the wait again on each change", () => {
    const { result, rerender } = renderDebounced("a")

    rerender({ text: "ab" })
    wait(150)
    rerender({ text: "abc" })
    wait(150)
    expect(result.current).toBe("a")

    wait(50)
    expect(result.current).toBe("abc")
  })

  it("uses the delay that the caller gives", () => {
    const { result, rerender } = renderDebounced("a", 50)

    rerender({ text: "ab" })
    wait(50)

    expect(result.current).toBe("ab")
  })

  it("applies a value that passes the predicate without a wait", () => {
    const { result, rerender } = renderDebounced("ab")

    rerender({ text: " " })
    expect(result.current).toBe(" ")
  })

  it("does not go back to the old value when a new value follows a cleared one", () => {
    const { result, rerender } = renderDebounced("ab")

    rerender({ text: "" })
    rerender({ text: "x" })
    expect(result.current).toBe("")

    wait(200)
    expect(result.current).toBe("x")
  })

  it("starts no timer for a value that applies at once", () => {
    renderDebounced("")

    expect(vi.getTimerCount()).toBe(0)
  })

  it("clears its timer when the component unmounts", () => {
    const { rerender, unmount } = renderDebounced("a")

    rerender({ text: "ab" })
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe("isBlank", () => {
  it.each(["", "  "])("is true for %j", (text) => {
    expect(isBlank(text)).toBe(true)
  })

  it("is false for a name", () => {
    expect(isBlank(" Troy ")).toBe(false)
  })
})
