/**
 * The address a visitor sees for a page that the build drew.
 *
 * The build writes each page to a file such as leaderboard.html, and the address it reports can
 * end in .html or /index. Pages serves the page without either, so the navigation compares that
 * form.
 */
export function visitorPathname(pathname: string): string {
  return pathname.replace(/\.html$/, "").replace(/\/index$/, "/") || "/"
}
