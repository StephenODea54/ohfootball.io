import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { RegionPanel } from "@/features/playoffs/components/region-panel"

const map = {
  width: 400,
  height: 420,
  outline: "M0,0Z",
  shapes: [
    { region: 9, path: "M1,1Z", label: { x: 10, y: 10 } },
    { region: 10, path: "M2,2Z", label: { x: 20, y: 20 } },
  ],
}

describe("RegionPanel", () => {
  it("marks the chosen region on the map", () => {
    const html = renderToStaticMarkup(<RegionPanel region={10} map={map} />)

    expect(html).toContain("Region 10")
    expect(html).toContain("Map of Ohio with Region 10 marked")
    expect(html).toMatch(/d="M2,2Z" class="[^"]*fill-primary/)
    expect(html).toMatch(/d="M1,1Z" class="[^"]*fill-muted/)
  })

  it("leaves out the map when the build has none", () => {
    const html = renderToStaticMarkup(<RegionPanel region={3} map={null} />)

    expect(html).toContain("Region 3")
    expect(html).not.toContain("<svg")
  })
})
