import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { RegionMap } from "@/features/map/components/region-map"
import { REGIONS } from "@/features/map/utils/regions"

const regions = REGIONS.map((region, index) => ({
  key: region.key,
  path: `M${index},0L${index + 1},1Z`,
  center: { x: 100 * (index + 1), y: 200 },
}))

const hoban = {
  id: "hoban-key",
  sourceId: "1",
  name: "Hoban",
  county: "Summit",
  primaryColor: null,
  secondaryColor: null,
  rating: { value: 65.2, rank: 1 },
  coordinates: { latitude: 41.06, longitude: -81.5 },
}

const html = renderToStaticMarkup(
  <RegionMap
    map={{ width: 1000, height: 1000, countyBorders: "M0,0", regions }}
    kingPoints={{ ne: { x: 800, y: 150 } }}
    kings={REGIONS.map((region) => ({
      region,
      king: region.key === "ne" ? hoban : null,
      color: region.key === "ne" ? "#1E90FF" : null,
    }))}
    dots={[
      { id: "a", x: 1, y: 2, radius: 3, opacity: 1, twinkleDelay: 100 },
      { id: "b", x: 5, y: 6, radius: 3, opacity: 0.5, twinkleDelay: null },
    ]}
  />,
)

describe("RegionMap", () => {
  it("draws every region with its own clip and glow", () => {
    for (const region of REGIONS) {
      expect(html).toContain(`id="region-clip-${region.key}"`)
      expect(html).toContain(`url(#region-glow-${region.key})`)
    }
    expect(html).toContain('cx="800"')
  })

  it("draws the schools as white dots in both themes", () => {
    expect(html).toContain("fill-bg motion-safe:animate-twinkle dark:fill-fg")
    expect(html).toContain("animation-delay:100ms")
  })

  it("links the king of a region to its page, on the map and in the list", () => {
    expect(html.match(/href="\/teams\/hoban-key"/g)).toHaveLength(2)
    expect(html).toContain("NE Ohio")
    expect(html).toContain("#1 · +65.2")
    expect(html).toContain("left:20%")
    expect(html).toContain("--tint:#1E90FF")
  })

  it("colors a region by its king and falls back to a gray of the theme", () => {
    expect(html).toContain("--tint:#1E90FF")
    expect(html).toContain("--tint:var(--color-muted-fg)")
    expect(html).toContain("[fill:var(--tint)]")
  })

  it("leaves out a region without a king", () => {
    expect(html).not.toContain("NW Ohio")
  })
})
