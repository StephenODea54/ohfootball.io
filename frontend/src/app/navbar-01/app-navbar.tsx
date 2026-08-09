"use client"

import { useNavigate, useRouterState } from "@tanstack/react-router"
import {
  Navbar,
  NavbarItem,
  NavbarMobile,
  NavbarProvider,
  NavbarSection,
  NavbarSeparator,
  NavbarSpacer,
  NavbarStart,
} from "@/components/ui/navbar"
import { SeasonSelect } from "@/components/season-select"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { CURRENT_SEASON, withSeason } from "@/lib/season"

const navItems = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Methodology", href: "/methodology" },
]

/** The wordmark. The suffix is tinted so the brand reads as one word with an accent. */
function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      ohfootball<span className="text-primary">.io</span>
    </span>
  )
}

export function AppNavbar() {
  const navigate = useNavigate()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const season = useRouterState({
    select: (state) => (state.location.search as { season?: number }).season ?? CURRENT_SEASON,
  })

  const navigation = (
    <NavbarSection className="flex flex-row items-center gap-1 sm:gap-2.5">
      {navItems.map((item) => (
        <NavbarItem
          isCurrent={
            item.href === "/" ? pathname === "/" || pathname.startsWith("/teams/") : pathname === item.href
          }
          key={item.href}
          href={withSeason(item.href, season)}
        >
          {item.label}
        </NavbarItem>
      ))}
    </NavbarSection>
  )

  const seasonSelect = (
    <SeasonSelect
      className="w-24"
      onSeasonChange={(nextSeason) =>
        navigate({ to: ".", search: (previous) => ({ ...previous, season: nextSeason }) })
      }
      season={season}
    />
  )

  // The separators group the three controls on the right so they stop reading as one crowded row.
  const controls = (
    <>
      {navigation}
      <NavbarSeparator className="mx-3" />
      {seasonSelect}
      <NavbarSeparator className="mx-3" />
      <ThemeSwitcher />
    </>
  )

  return (
    <NavbarProvider
      style={
        {
          "--navbar": "var(--color-bg)",
        } as React.CSSProperties
      }
    >
      <Navbar intent="default" isSticky>
        <NavbarStart>
          <Wordmark className="font-semibold" />
        </NavbarStart>
        <NavbarSpacer />
        {controls}
      </Navbar>

      <NavbarMobile>
        <Wordmark className="font-semibold text-sm" />
        <NavbarSpacer />
        {controls}
      </NavbarMobile>
    </NavbarProvider>
  )
}
