import { describe, expect, it } from "vitest"
import type { MapTeam } from "@/features/map/api/get-map-teams"
import { readCounties } from "@/features/map/server/ohio-map"
import { REGIONS, regionKings, regionOfCounty } from "@/features/map/utils/regions"

function team(
  id: string,
  county: string | null,
  rank: number | null,
  colors: [string | null, string | null] = [null, null],
): MapTeam {
  return {
    id,
    sourceId: id,
    name: id,
    county,
    primaryColor: colors[0],
    secondaryColor: colors[1],
    rating: rank === null ? null : { value: 50 - rank, rank },
    coordinates: null,
  }
}

describe("REGIONS", () => {
  it("puts each of the 88 Ohio counties in exactly one region", () => {
    const ohio = readCounties()
      .objects.counties.geometries.filter((county) => String(county.id).startsWith("39"))
      .map((county) => (county.properties as { name: string }).name)
      .sort()
    const assigned = REGIONS.flatMap((region) => region.counties).sort()

    expect(assigned).toEqual(ohio)
  })
})

describe("regionOfCounty", () => {
  it("finds the region of a county", () => {
    expect(regionOfCounty("Stark")).toBe("ne")
    expect(regionOfCounty("Van Wert")).toBe("nw")
    expect(regionOfCounty("Hamilton")).toBe("sw")
  })

  it("gives null for a county it does not know", () => {
    expect(regionOfCounty(null)).toBeNull()
    expect(regionOfCounty("Allegheny")).toBeNull()
  })
})

describe("regionKings", () => {
  it("crowns the best rated school of each region", () => {
    const kings = regionKings([
      team("massillon", "Stark", 4),
      team("hoban", "Summit", 1, ["#FFFFFF", "#2E6BD9"]),
      team("unrated", "Cuyahoga", null),
      team("moeller", "Hamilton", 3),
      team("pittsburgh", null, 2),
    ])
    const byRegion = Object.fromEntries(kings.map((entry) => [entry.region.key, entry]))

    expect(kings.map((entry) => entry.region.key)).toEqual(["nw", "ne", "central", "sw", "se"])
    expect(byRegion.ne?.king?.id).toBe("hoban")
    expect(byRegion.sw?.king?.id).toBe("moeller")
    expect(byRegion.nw?.king).toBeNull()
    // White would vanish on a white page, so Hoban's region takes its second color.
    expect(byRegion.ne?.color).toBe("#2E6BD9")
    expect(byRegion.sw?.color).toBeNull()
    expect(byRegion.nw?.color).toBeNull()
  })
})
