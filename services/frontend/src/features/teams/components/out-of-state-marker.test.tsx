import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { OutOfStateMarker } from "@/features/teams/components/out-of-state-marker"

describe("OutOfStateMarker", () => {
  it("shows a named button with an icon for a marked school", () => {
    const html = renderToStaticMarkup(<OutOfStateMarker team={{ outOfStateGamesPlayed: 2 }} />)

    expect(html).toContain("<button")
    expect(html).toContain('aria-label="2 out-of-state games at half weight"')
    expect(html).toContain("<svg")
    expect(html).toContain('aria-hidden="true"')
  })

  it("keeps the popover closed until a press", () => {
    const html = renderToStaticMarkup(<OutOfStateMarker team={{ outOfStateGamesPlayed: 3 }} />)

    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain("Less behind this rating")
  })

  it("keeps the classes of the caller", () => {
    const html = renderToStaticMarkup(
      <OutOfStateMarker team={{ outOfStateGamesPlayed: 2 }} className="ms-1" />,
    )

    expect(html).toContain("ms-1")
  })

  it("shows nothing for a school below the threshold", () => {
    expect(renderToStaticMarkup(<OutOfStateMarker team={{ outOfStateGamesPlayed: 1 }} />)).toBe("")
    expect(renderToStaticMarkup(<OutOfStateMarker team={{ outOfStateGamesPlayed: 0 }} />)).toBe("")
  })
})
