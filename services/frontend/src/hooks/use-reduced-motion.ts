import { useEffect, useState } from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

/**
 * Tells if the visitor asks for less motion in the settings of the system. It is false until the
 * page runs in a browser, and it follows a change of the setting.
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = () => setReduced(mql.matches)
    mql.addEventListener("change", onChange)
    setReduced(mql.matches)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return reduced
}
