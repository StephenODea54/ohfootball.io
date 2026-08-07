"use client"

import { useRouterState } from "@tanstack/react-router"
import {
  Navbar,
  NavbarItem,
  NavbarMobile,
  NavbarProvider,
  NavbarSection,
  NavbarSpacer,
  NavbarStart,
} from "@/components/ui/navbar"
import { ThemeSwitcher } from "@/components/theme-switcher"

const navItems = [
  { label: "teams", href: "/" },
  { label: "leaderboard", href: "/leaderboard" },
  { label: "about", href: "/about" },
]

export function AppNavbar() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  const navigation = (
    <NavbarSection className="flex flex-row items-center gap-1 sm:gap-2.5">
      {navItems.map((item) => (
        <NavbarItem
          isCurrent={
            item.href === "/" ? pathname === "/" || pathname.startsWith("/teams/") : pathname === item.href
          }
          key={item.href}
          href={item.href}
        >
          {item.label}
        </NavbarItem>
      ))}
    </NavbarSection>
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
        <ThemeSwitcher />
      </Navbar>

      <NavbarMobile>
        <span className="font-semibold text-sm">ohfootball</span>
        <NavbarSpacer />
        {navigation}
        <ThemeSwitcher />
      </NavbarMobile>
    </NavbarProvider>
  )
}
