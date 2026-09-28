"use client"

import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light" | "system"
type ResolvedTheme = Exclude<Theme, "system">

type ThemeContextValue = {
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
  theme: Theme
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/** The theme the visitor chose. The build has no browser, so it reads "system". */
function savedTheme(): Theme {
  try {
    const theme = window.localStorage.getItem("theme")
    if (theme === "dark" || theme === "light" || theme === "system") return theme
  } catch {
    // The build has no window, and a browser can refuse access to its storage.
  }
  return "system"
}

function resolve(theme: Theme): ResolvedTheme {
  if (theme !== "system") return theme
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

/**
 * Holds the theme and applies it to the page.
 *
 * The state starts from the saved theme and not from a default. Otherwise the first effect would
 * apply the default and remove the theme that the script in the head of the page set, and the
 * page would flash. No markup depends on the theme, so the state can differ from the build
 * without a hydration mismatch.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(savedTheme)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolve(theme))

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

    const applyTheme = () => {
      const nextTheme = resolve(theme)

      document.documentElement.classList.toggle("dark", nextTheme === "dark")
      document.documentElement.style.colorScheme = nextTheme
      setResolvedTheme(nextTheme)
    }

    applyTheme()
    mediaQuery.addEventListener("change", applyTheme)

    return () => mediaQuery.removeEventListener("change", applyTheme)
  }, [theme])

  const setTheme = (nextTheme: Theme) => {
    try {
      window.localStorage.setItem("theme", nextTheme)
    } catch {
      // The choice then lasts only until the next page load.
    }
    setThemeState(nextTheme)
  }

  return (
    <ThemeContext.Provider value={{ resolvedTheme, setTheme, theme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider")
  }

  return context
}
