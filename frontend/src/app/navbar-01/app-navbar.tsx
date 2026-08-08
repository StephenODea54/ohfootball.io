"use client"

import { useNavigate, useRouterState } from "@tanstack/react-router"
import {
  Navbar,
  NavbarItem,
  NavbarMobile,
  NavbarProvider,
  NavbarSection,
  NavbarSpacer,
  NavbarStart,
} from "@/components/ui/navbar"
import { SeasonSelect } from "@/components/season-select"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { CURRENT_SEASON, withSeason } from "@/lib/season"

const navItems = [
  { label: "Home", href: "/" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Methodology", href: "/methodology" },
  { label: "About", href: "/about" },
]

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
          <span className="font-semibold">ohfootball.io</span>
        </NavbarStart>
        <NavbarSpacer />
        {navigation}
        {seasonSelect}
        <ThemeSwitcher />
      </Navbar>

      <NavbarMobile>
        <span className="font-semibold text-sm">ohfootball</span>
        <NavbarSpacer />
        {navigation}
        {seasonSelect}
        <ThemeSwitcher />
      </NavbarMobile>
    </NavbarProvider>
  )
}
