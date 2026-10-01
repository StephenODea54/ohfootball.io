import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { MapTeam } from "@/features/map/api/get-map-teams"
import { RegionPoster } from "@/features/map/components/region-poster"
import { REGIONS } from "@/features/map/utils/regions"

const regions = REGIONS.map((region, index) => ({
  key: region.key,
  path: `M${index},0L${index + 1},1Z`,
  center: { x: 100 * (index + 1), y: 200 },
}))

function king(id: string, sourceId: string): MapTeam & { rating: { value: number; rank: number } } {
  return {
    id,
    sourceId,
    name: id,
    county: null,
    primaryColor: null,
    secondaryColor: null,
    rating: { value: 65.2, rank: 1 },
    coordinates: null,
  }
}

// 842 has a logo file. 1 does not.
const html = renderToStaticMarkup(
  <RegionPoster
    map={{ width: 1048, height: 1048, countyBorders: "M0,0", regions }}
    kings={REGIONS.map((region) => ({
      region,
      king:
        region.key === "ne"
          ? king("hoban-key", "842")
          : region.key === "sw"
            ? king("sw", "1")
            : null,
      color: region.key === "ne" ? "#1E90FF" : null,
    }))}
    dots={[
      { id: "big", x: 1, y: 2, radius: 5, opacity: 1, twinkleDelay: 100, region: "ne" },
      { id: "small", x: 5, y: 6, radius: 2.4, opacity: 0.5, twinkleDelay: null, region: "ne" },
      { id: "lost", x: 7, y: 8, radius: 6, opacity: 1, twinkleDelay: null, region: null },
    ]}
  />,
)

describe("RegionPoster", () => {
  it("fills each region with the color of its king, or a gray of the theme", () => {
    expect(html).toContain("--tint:#1E90FF")
    expect(html).toContain("--tint:var(--color-muted-fg)")
    expect(html.match(/filter="url\(#poster-neon\)"/g)).toHaveLength(REGIONS.length)
  })

  it("lays the large logo of a king over its region at its spot", () => {
    expect(html).toContain('href="/logos/842-192.webp"')
    // The NE logo is a quarter of the state wide and centered at 81% across and 25% down.
    expect(html).toContain('width="250"')
    expect(html).toContain('x="709"')
    expect(html).toContain('y="149"')
    // One copy sits under the dots, and a hidden copy sits above them for the hover.
    expect(html.match(/<image/g)).toHaveLength(2)
    expect(html).toContain('data-logo="ne"')
  })

  it("fades the dots where a logo sits", () => {
    const mask = html.slice(html.indexOf('<mask id="poster-logo-mask"'), html.indexOf("</mask>"))
    expect(mask.match(/<circle/g)).toHaveLength(1)
    expect(mask).toContain('cx="834"')
    expect(mask).toContain('r="125"')
    expect(html).toContain('mask="url(#poster-logo-mask)"')
  })

  it("gives a colored halo only to a large dot with a region", () => {
    const halos = html.slice(html.indexOf('filter="url(#poster-halo)"'))
    const haloGroup = halos.slice(0, halos.indexOf("</g>"))
    expect(haloGroup.match(/<circle/g)).toHaveLength(1)
    expect(haloGroup).toContain('r="12"')
  })

  it("draws every school as a white dot, some of them twinkling", () => {
    expect(html.match(/fill-white/g)).toHaveLength(3)
    expect(html).toContain("animation-delay:100ms")
  })

  it("names the region of each shape and each card, so the page can light one up", () => {
    expect(html).toContain('class="region-poster"')
    expect(html.match(/data-region="ne"/g)).toHaveLength(3)
    expect(html.match(/data-card="ne"/g)).toHaveLength(2)
  })

  it("places a card for each king on the map and lists it again for small screens", () => {
    expect(html.match(/href="\/teams\/hoban-key"/g)).toHaveLength(2)
    expect(html).toContain("right:0%;top:19%")
    expect(html).toContain("NE Ohio")
    expect(html).toContain("#1 · +65.2")
    expect(html).not.toContain("NW Ohio")
  })
})
