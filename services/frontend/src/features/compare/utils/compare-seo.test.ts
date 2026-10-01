import { describe, expect, it } from "vitest"
import { comparePageHead } from "@/features/compare/utils/compare-seo"

const site = new URL("https://ohfootball.io")

describe("comparePageHead", () => {
  it("names the page and its path from the home page", () => {
    const head = comparePageHead(site)

    expect(head.title).toBe("Compare Schools | ohfootball.io")
    expect(head.description).toContain("season by season")
    expect(JSON.stringify(head.jsonLd)).toContain("https://ohfootball.io/compare")
  })
})
