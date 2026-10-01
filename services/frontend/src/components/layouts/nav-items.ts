import { paths } from "@/config/paths"

/** The pages in the navigation bar, in the order it shows them. */
export const navItems = [
  { label: "Home", ...paths.home },
  { label: "About", ...paths.about },
  { label: "Leaderboard", ...paths.leaderboard },
  { label: "Compare", ...paths.compare },
  { label: "Methodology", ...paths.methodology },
  { label: "Accuracy", ...paths.accuracy },
  { label: "Data", ...paths.data },
  { label: "API", ...paths.api },
]

/** A team page belongs to Home, because a school is found from the home page. */
export function isCurrentPage(itemPath: string, pathname: string) {
  return itemPath === "/"
    ? pathname === "/" || pathname.startsWith("/teams/")
    : pathname === itemPath
}
