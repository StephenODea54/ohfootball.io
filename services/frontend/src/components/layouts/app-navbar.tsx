"use client"

import { Bars2Icon } from "@heroicons/react/20/solid"
import { ThemeProvider } from "@/components/theme/theme-provider"
import { ThemeSwitcher } from "@/components/theme/theme-switcher"
import { buttonStyles } from "@/components/ui/button"
import { Link } from "@/components/ui/link"
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu"
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
import { paths } from "@/config/paths"

const navItems = [
  { label: "Home", ...paths.home },
  { label: "About", ...paths.about },
  { label: "Leaderboard", ...paths.leaderboard },
  { label: "Methodology", ...paths.methodology },
  { label: "API", ...paths.api },
]

/** A team page belongs to Home, because a school is found from the home page. */
function isCurrentPage(itemPath: string, pathname: string) {
  return itemPath === "/"
    ? pathname === "/" || pathname.startsWith("/teams/")
    : pathname === itemPath
}

/**
 * The page links on a narrow screen. The links and the theme switch do not fit in one row
 * there, and the row made the whole page scroll to the side. A menu holds the links instead.
 */
function PageMenu({ pathname }: { pathname: string }) {
  return (
    <Menu>
      <MenuTrigger aria-label="Pages" className={buttonStyles({ intent: "plain", size: "sq-sm" })}>
        <Bars2Icon />
      </MenuTrigger>
      <MenuContent aria-label="Pages" placement="bottom end" items={navItems}>
        {(item) => (
          <MenuItem
            id={item.path}
            href={item.getHref()}
            className={isCurrentPage(item.path, pathname) ? "font-semibold" : undefined}
          >
            {item.label}
          </MenuItem>
        )}
      </MenuContent>
    </Menu>
  )
}

/**
 * The wordmark, which links to the home page. The suffix is tinted so the brand reads as one word
 * with an accent.
 */
function Wordmark({ className }: { className?: string }) {
  return (
    <Link href={paths.home.getHref()} className={className}>
      ohfootball<span className="text-primary">.io</span>
    </Link>
  )
}

/**
 * The bar at the top of every page. The page tells it its own address, because each page is drawn
 * ahead of time and there is no router to ask.
 */
export function AppNavbar({ pathname }: { pathname: string }) {
  const navigation = (
    <NavbarSection className="flex flex-row items-center gap-1 sm:gap-2.5">
      {navItems.map((item) => (
        <NavbarItem
          isCurrent={isCurrentPage(item.path, pathname)}
          key={item.path}
          href={item.getHref()}
        >
          {item.label}
        </NavbarItem>
      ))}
    </NavbarSection>
  )

  // The separator keeps the links apart from the theme switch.
  const controls = (
    <>
      {navigation}
      <NavbarSeparator className="mx-3" />
      <ThemeSwitcher />
    </>
  )

  // The theme switch is the only part of the site that reads the theme, so the provider lives in
  // this island.
  return (
    <ThemeProvider>
      <NavbarProvider style={{ "--navbar": "var(--color-bg)" } as React.CSSProperties}>
        <Navbar intent="default" isSticky>
          <NavbarStart>
            <Wordmark className="font-semibold text-fg" />
          </NavbarStart>
          <NavbarSpacer />
          {controls}
        </Navbar>

        <NavbarMobile>
          <Wordmark className="font-semibold text-fg text-sm" />
          <NavbarSpacer />
          <ThemeSwitcher />
          <PageMenu pathname={pathname} />
        </NavbarMobile>
      </NavbarProvider>
    </ThemeProvider>
  )
}
