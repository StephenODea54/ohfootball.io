import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { InfoButton } from "@/features/teams/components/info-button"

describe("InfoButton", () => {
  it("shows a named button with an icon", () => {
    const html = renderToStaticMarkup(<InfoButton label="Highlights" note="A note." />)

    expect(html).toContain("<button")
    expect(html).toContain('aria-label="About Highlights"')
    expect(html).toContain("<svg")
    expect(html).toContain('aria-hidden="true"')
  })

  it("keeps the popover and the tooltip closed until a press or a hover", () => {
    const html = renderToStaticMarkup(<InfoButton label="Highlights" note="A note." />)

    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain("A note.")
  })
})
