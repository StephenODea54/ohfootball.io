import { describe, expect, it } from "vitest"
import {
  breadcrumbListJsonLd,
  jsonLdGraph,
  jsonLdScript,
  pageUrl,
  siteUrl,
  webSiteJsonLd,
} from "@/utils/seo"

const site = new URL("https://ohfootball.io")

describe("siteUrl", () => {
  it("returns the site address", () => {
    expect(siteUrl(site)).toBe(site)
  })

  it("stops when no site address is set", () => {
    expect(() => siteUrl(undefined)).toThrow("site is not set in astro.config.ts")
  })
})

describe("pageUrl", () => {
  it.each([
    ["/index.html", "https://ohfootball.io/"],
    ["/", "https://ohfootball.io/"],
    ["/leaderboard.html", "https://ohfootball.io/leaderboard"],
    ["/leaderboard", "https://ohfootball.io/leaderboard"],
    ["/teams/abc.html", "https://ohfootball.io/teams/abc"],
    ["/about", "https://ohfootball.io/about"],
    ["/a b", "https://ohfootball.io/a%20b"],
  ])("reads %j as %j", (pathname, expected) => {
    expect(pageUrl(site, pathname)).toBe(expected)
  })

  it("writes no second slash when the site address ends with a slash", () => {
    expect(pageUrl(new URL("https://ohfootball.io/"), "/leaderboard")).toBe(
      "https://ohfootball.io/leaderboard",
    )
  })
})

describe("jsonLdScript", () => {
  it("leaves plain data as JSON", () => {
    expect(jsonLdScript({ name: "Team" })).toBe('{"name":"Team"}')
  })

  it("keeps a name from ending the script", () => {
    const text = jsonLdScript({ name: "</script><script>alert(1)</script>" })

    expect(text).not.toContain("<")
    expect(text).not.toContain(">")
  })

  it.each([
    ["<", "\\u003c"],
    [">", "\\u003e"],
    ["&", "\\u0026"],
    ["\u2028", "\\u2028"],
    ["\u2029", "\\u2029"],
  ])("writes %j as %j", (character, written) => {
    expect(jsonLdScript({ name: character })).toBe(`{"name":"${written}"}`)
  })

  it("reads back as the same data", () => {
    const data = { name: "A & B <C> \u2028\u2029" }

    expect(JSON.parse(jsonLdScript(data))).toEqual(data)
  })
})

describe("webSiteJsonLd", () => {
  it("describes the site", () => {
    expect(webSiteJsonLd(site, "ohfootball.io", "Ratings")).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "ohfootball.io",
      url: "https://ohfootball.io/",
      description: "Ratings",
    })
  })
})

describe("breadcrumbListJsonLd", () => {
  it("numbers each step from one", () => {
    expect(
      breadcrumbListJsonLd([
        { name: "Home", url: "https://ohfootball.io/" },
        { name: "Leaderboard", url: "https://ohfootball.io/leaderboard" },
      ]),
    ).toEqual({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://ohfootball.io/" },
        {
          "@type": "ListItem",
          position: 2,
          name: "Leaderboard",
          item: "https://ohfootball.io/leaderboard",
        },
      ],
    })
  })
})

describe("jsonLdGraph", () => {
  it("puts the records under one context", () => {
    expect(jsonLdGraph({ "@type": "A" }, { "@type": "B" })).toEqual({
      "@context": "https://schema.org",
      "@graph": [{ "@type": "A" }, { "@type": "B" }],
    })
  })

  it("reads back as the same data from its script", () => {
    const graph = jsonLdGraph({ "@type": "SportsTeam", name: "St John's Eagles (club)" })

    expect(JSON.parse(jsonLdScript(graph))).toEqual(graph)
  })
})
