import { useEffect, useState } from "react"

const DEFAULT_DELAY_MS = 200

interface DebounceOptions<T> {
  /** How long the value must stay the same before it applies, in milliseconds. */
  delayMs?: number
  /** Tells which values apply without the wait, such as an empty search. */
  applyAtOnce?: (value: T) => boolean
}

/**
 * The value as it was after it stayed the same for the delay. The field that gives the value can
 * show each keystroke at once, while the work that reads this result runs once per pause.
 */
export function useDebouncedValue<T>(
  value: T,
  { delayMs = DEFAULT_DELAY_MS, applyAtOnce }: DebounceOptions<T> = {},
): T {
  const [debounced, setDebounced] = useState(value)
  // The predicate is read here and not in the effect. A new function on each render of the parent
  // then does not start the wait again.
  const atOnce = applyAtOnce?.(value) ?? false
  // React allows a component to set its own state during render. The result changes in this same
  // render, so no stale value shows for a frame.
  if (atOnce && debounced !== value) setDebounced(value)

  useEffect(() => {
    if (atOnce) return
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [atOnce, delayMs, value])

  return debounced
}

/** Tells if a search text has no characters other than spaces. */
export function isBlank(text: string) {
  return text.trim() === ""
}
