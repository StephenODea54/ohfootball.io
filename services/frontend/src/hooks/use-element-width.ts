import { type RefObject, useEffect, useState } from "react"

/** The width before the page measures the element, and when the element has no width. */
export const FALLBACK_WIDTH = 640

/**
 * The width of an element in CSS pixels. It follows each change of the size of the element. A
 * browser without ResizeObserver follows a change of the size of the window.
 */
export function useElementWidth(ref: RefObject<Element | null>) {
  const [width, setWidth] = useState(FALLBACK_WIDTH)

  useEffect(() => {
    const element = ref.current
    const measure = () => {
      const measured = element?.getBoundingClientRect().width ?? 0
      setWidth(measured > 0 ? measured : FALLBACK_WIDTH)
    }
    measure()
    if (element && typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure)
      observer.observe(element)
      return () => observer.disconnect()
    }
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [ref])

  return width
}
