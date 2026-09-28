import { visitorPathname } from "@/utils/pathname"

/** The site address from astro.config.ts. The build stops when it is not set. */
export function siteUrl(site: URL | undefined): URL {
  if (!site) throw new Error("site is not set in astro.config.ts")
  return site
}

/**
 * The one address of a page for search engines and link previews. It is always on the site
 * address, so a copy of the page on www.ohfootball.io or on pages.dev points to ohfootball.io.
 */
export function pageUrl(site: URL, pathname: string): string {
  return new URL(visitorPathname(pathname), site).href
}

/**
 * The text of a JSON-LD script. Astro writes it without escapes, so these characters are written
 * as JSON escapes. Then the data cannot end the script or be read as markup.
 */
export function jsonLdScript(data: object): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}

/** The WebSite record of the home page. */
export function webSiteJsonLd(site: URL, name: string, description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url: site.href,
    description,
  }
}
