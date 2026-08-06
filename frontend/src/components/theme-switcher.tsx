"use client"

import { MoonIcon, SunIcon } from "@heroicons/react/20/solid"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"

export function ThemeSwitcher() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  return (
    <Button
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      intent="plain"
      isCircle
      onPress={() => setTheme(isDark ? "light" : "dark")}
      size="sq-sm"
    >
      {isDark ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
    </Button>
  )
}
