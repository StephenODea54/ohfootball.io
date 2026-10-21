// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** A media query whose answer the test sets, and that tells its listeners of a change. */
function fakeQuery(matches: boolean) {
  const listeners = new Set<() => void>()
  const query = {
    matches,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    change(next: boolean) {
      query.matches = next
      for (const listener of listeners) listener()
    },
    listeners,
  }
  vi.spyOn(window, "matchMedia").mockReturnValue(query as unknown as MediaQueryList)
  return query
}

describe("useReducedMotion", () => {
  it("reads the setting of the system", () => {
    fakeQuery(true)
    const { result } = renderHook(() => useReducedMotion())

    expect(result.current).toBe(true)
    expect(window.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)")
  })

  it("follows a change of the setting and stops listening when it unmounts", () => {
    const query = fakeQuery(false)
    const { result, unmount } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)

    act(() => query.change(true))
    expect(result.current).toBe(true)

    unmount()
    expect(query.listeners.size).toBe(0)
  })
})
