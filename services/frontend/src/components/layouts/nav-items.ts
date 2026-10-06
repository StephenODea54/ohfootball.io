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

/**
 * A page is current only on its own address. A team page has no item, because many pages link to
 * it.
 */
export function isCurrentPage(itemPath: string, pathname: string) {
  return pathname === itemPath
}
