import { useEffectEvent, useLayoutEffect, useRef } from "react"

/**
 * Keeps the text that a visitor typed into a search field before React took over the page. The
 * server sends the field empty. React keeps the typed text while it hydrates, but the next render
 * writes the empty value back. Give the ref to an element that holds the field.
 */
export function useTypedBeforeHydration<E extends HTMLElement>(onTyped: (text: string) => void) {
  const ref = useRef<E>(null)
  const seed = useEffectEvent(onTyped)

  // A layout effect runs in the same commit as the hydration, before a render can clear the field.
  useLayoutEffect(() => {
    const input = ref.current?.querySelector("input")
    if (!input) return
    if (input.value) seed(input.value)
    // React Aria learns of focus only from React events, and this focus came before React listened.
    if (document.activeElement === input) {
      input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
    }
  }, [])

  return ref
}
