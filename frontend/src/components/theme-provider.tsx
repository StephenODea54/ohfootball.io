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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system")
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light")

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("theme")

    if (savedTheme === "dark" || savedTheme === "light" || savedTheme === "system") {
      setThemeState(savedTheme)
    }
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

    const applyTheme = () => {
      const nextTheme = theme === "system" ? (mediaQuery.matches ? "dark" : "light") : theme

      document.documentElement.classList.toggle("dark", nextTheme === "dark")
      document.documentElement.style.colorScheme = nextTheme
      setResolvedTheme(nextTheme)
    }

    applyTheme()
    mediaQuery.addEventListener("change", applyTheme)

    return () => mediaQuery.removeEventListener("change", applyTheme)
  }, [theme])

  const setTheme = (nextTheme: Theme) => {
    window.localStorage.setItem("theme", nextTheme)
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
