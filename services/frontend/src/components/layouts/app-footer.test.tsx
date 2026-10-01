import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { AppFooter } from "@/components/layouts/app-footer"
import { links } from "@/config/paths"

describe("AppFooter", () => {
  const html = renderToStaticMarkup(<AppFooter />)

  it("links to the code, the issue tracker, and the author", () => {
    expect(html).toContain(`href="${links.repository}"`)
    expect(html).toContain(`href="${links.issues}"`)
    expect(html).toContain(`href="${links.contact}"`)
  })

  it("does not link to the dataset", () => {
    expect(html).not.toContain(`href="${links.dataset}"`)
    expect(html).not.toContain("Kaggle")
  })
})
