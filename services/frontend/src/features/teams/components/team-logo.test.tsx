import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { TeamLogo } from "@/features/teams/components/team-logo"

vi.mock("@/features/teams/utils/logo-manifest.json", () => ({ default: ["842"] }))

const laSalle = { sourceId: "842", name: "La Salle" }
const club = { sourceId: "9999", name: "West Union (club)" }

describe("TeamLogo", () => {
  it("shows the small file in a row and loads it late", () => {
    const html = renderToStaticMarkup(<TeamLogo team={laSalle} size="sm" />)

    expect(html).toContain('src="/logos/842-80.webp"')
    expect(html).toContain('alt=""')
    expect(html).toContain('width="80"')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain("size-10")
  })

  it("shows the large file at the top of a page and loads it at once", () => {
    const html = renderToStaticMarkup(<TeamLogo team={laSalle} size="lg" priority />)

    expect(html).toContain('src="/logos/842-192.webp"')
    expect(html).toContain('loading="eager"')
    expect(html).toContain("sm:size-24")
  })

  it("keeps the classes of the caller", () => {
    const html = renderToStaticMarkup(<TeamLogo team={laSalle} size="xs" className="mt-1" />)

    expect(html).toContain("size-6")
    expect(html).toContain("mt-1")
  })

  it("shows the initials without an image for a team without a logo", () => {
    const html = renderToStaticMarkup(<TeamLogo team={club} size="sm" />)

    expect(html).not.toContain("<img")
    expect(html).not.toContain("<svg")
    expect(html).toContain(">WU</span>")
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain("size-10")
  })

  it("makes the initials as large as the logo at the top of a page", () => {
    const html = renderToStaticMarkup(<TeamLogo team={club} size="lg" />)

    expect(html).toContain("sm:size-24")
    expect(html).toContain("sm:text-3xl/none")
  })

  it("keeps an empty box for a name without letters, so the rows stay in line", () => {
    const html = renderToStaticMarkup(
      <TeamLogo team={{ sourceId: null, name: "(club)" }} size="xs" />,
    )

    expect(html).toContain("size-6")
    expect(html).toContain("></span>")
  })
})
