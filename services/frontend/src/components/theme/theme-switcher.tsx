"use client"

import { MoonIcon, SunIcon } from "@heroicons/react/20/solid"
import { useTheme } from "@/components/theme/theme-provider"
import { Button } from "@/components/ui/button"

/**
 * The button that switches between the light and the dark theme.
 *
 * The page is drawn ahead of time, and the script in the head of the page sets the `dark` class
 * before the page is painted. So the button holds the icon and the label of both themes, and the
 * `dark:` classes show the right pair. The button is then correct before its script runs, and a
 * screen reader reads only the label that shows.
 */
export function ThemeSwitcher() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      intent="plain"
      isCircle
      onPress={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      size="sq-sm"
    >
      <MoonIcon aria-hidden className="dark:hidden" />
      <SunIcon aria-hidden className="hidden dark:block" />
      <span className="sr-only dark:hidden">Switch to dark mode</span>
      <span className="sr-only hidden dark:inline">Switch to light mode</span>
    </Button>
  )
}
