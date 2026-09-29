import { describe, expect, it } from "vitest"
import { awesomeSites } from "@/features/about/awesome-sites"

describe("the awesome sites", () => {
  it("shows the sites in order", () => {
    expect(awesomeSites.map((site) => site.name)).toEqual([
      "joeeitel.com",
      "ohhsfbdb.net",
      "Fantastic 50",
    ])
  })

  it("marks only the sites that the scores come from", () => {
    const sources = awesomeSites.filter((site) => site.isScoreSource).map((site) => site.name)
    expect(sources).toEqual(["joeeitel.com", "ohhsfbdb.net"])
  })

  it("links to each site once, over https", () => {
    const hrefs = awesomeSites.map((site) => site.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    for (const href of hrefs) expect(href).toMatch(/^https:\/\//)
  })

  it("describes each site in one full sentence", () => {
    for (const site of awesomeSites) expect(site.description).toMatch(/^[A-Z][^.]*\.$/)
  })
})
