import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { links } from "@/config/paths"
import { PrivacyContent } from "@/features/privacy/components/privacy-content"

describe("PrivacyContent", () => {
  const html = renderToStaticMarkup(<PrivacyContent />)

  it("says the site sets no cookie and needs no account", () => {
    expect(html).toContain("The site sets no cookie, and you do not need an account.")
    expect(html).toContain("light or a dark theme in your browser")
    expect(html).toContain("Cloudflare hosts the site.")
  })

  it("tells what Pick 'Em stores and for how long", () => {
    expect(html).toContain("HMAC-SHA256")
    expect(html).toContain("never stores the address itself")
    expect(html).toContain("first 64 bits")
    expect(html).toContain("people on one network")
    expect(html).toContain("until midnight in Ohio after the game day")
    expect(html).toContain("the season, and the date of the game")
    expect(html).toContain("deletes the hash and the pick about 10 days after the game")
    expect(html).toContain("at most once an hour")
    expect(html).toContain("backups for up to 30 days")
  })

  it("gives the address to write to", () => {
    expect(html).toContain(`href="${links.contact}"`)
    expect(html).toContain("hey@ohfootball.io")
  })

  it("does not name the API", () => {
    expect(html.toLowerCase()).not.toContain("graphql")
    expect(html).not.toContain("api.ohfootball.io")
  })
})
