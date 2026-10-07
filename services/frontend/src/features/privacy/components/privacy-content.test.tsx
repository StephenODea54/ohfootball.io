import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { links } from "@/config/paths"
import { PrivacyContent } from "@/features/privacy/components/privacy-content"

describe("PrivacyContent", () => {
  // React writes a number in text with comment markers around it, so they are removed first.
  const text = renderToStaticMarkup(<PrivacyContent />)
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")

  it("says the site has no accounts and no cookies", () => {
    expect(text).toContain(
      "ohfootball.io has no accounts and sets no cookies. Your browser remembers whether you chose light or dark mode. That setting never leaves your device.",
    )
  })

  it("says what a vote stores and for how long", () => {
    expect(text).toContain(
      "When you vote on a game, we store your vote with a scrambled form of your network address. We never store the address itself, and nothing else about you. Everyone on the same network shares one vote. We delete the scrambled address about 10 days after the game and keep only the vote totals.",
    )
  })

  it("gives the address for questions", () => {
    const html = renderToStaticMarkup(<PrivacyContent />)
    expect(text).toContain("Questions: hey@ohfootball.io")
    expect(html).toContain(`href="${links.contact}"`)
  })

  it("does not name the API", () => {
    expect(text.toLowerCase()).not.toContain("graphql")
    expect(text).not.toContain("api.ohfootball.io")
  })
})
