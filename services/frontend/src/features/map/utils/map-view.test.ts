import { describe, expect, it } from "vitest"
import {
  divisionList,
  divisionOfRegion,
  hasFilters,
  matchingMarkers,
  NO_FILTERS,
  parseMapFilters,
  regionItems,
  selectedCounties,
  withCounty,
  withDivision,
  withRegion,
  zoomTarget,
} from "@/features/map/utils/map-view"
import type { MapMarker } from "@/features/map/utils/markers"
import { wholeMap } from "@/features/map/utils/zoom"

function marker(
  id: string,
  county: string | null,
  division: number | null,
  region: number | null,
  x = 500,
  y = 500,
): MapMarker {
  return {
    id,
    sourceId: id,
    name: id,
    county,
    division,
    region,
    rank: 1,
    rating: 10,
    x,
    y,
    color: null,
  }
}

const markers = [
  marker("a", "Stark", 2, 7, 700, 300),
  marker("b", "Stark", 3, 9, 710, 310),
  marker("c", "Summit", 2, 7, 650, 250),
  marker("d", "Franklin", 2, 8, 450, 600),
  marker("e", "Franklin", null, null),
  marker("f", null, 3, 11),
]

const divisions = divisionList(markers)

const map = {
  width: 1000,
  height: 1084,
  counties: [
    {
      name: "Franklin",
      path: "M0,0Z",
      bounds: [400, 550, 500, 650] as [number, number, number, number],
    },
    {
      name: "Stark",
      path: "M0,0Z",
      bounds: [680, 280, 740, 340] as [number, number, number, number],
    },
    {
      name: "Summit",
      path: "M0,0Z",
      bounds: [620, 220, 680, 280] as [number, number, number, number],
    },
  ],
  regions: { 2: [8, 7, 7], 3: [11, 9, 9] },
}
const counties = map.counties.map((county) => county.name)

describe("divisionList", () => {
  it("lists the divisions and regions of the schools, in order", () => {
    expect(divisions).toEqual([
      { division: 2, regions: [7, 8] },
      { division: 3, regions: [9, 11] },
    ])
  })
})

describe("divisionOfRegion", () => {
  it("finds the one division that holds a region", () => {
    expect(divisionOfRegion(9, divisions)).toBe(3)
    expect(divisionOfRegion(4, divisions)).toBeNull()
  })

  it("gives no division when two divisions hold the region", () => {
    expect(
      divisionOfRegion(1, [
        { division: 1, regions: [1] },
        { division: 2, regions: [1] },
      ]),
    ).toBeNull()
  })
})

describe("parseMapFilters", () => {
  it("reads each filter and the canonical name of the county", () => {
    expect(parseMapFilters("?division=2&region=7&county=sTARK", divisions, map)).toEqual({
      division: 2,
      region: 7,
      county: "Stark",
    })
  })

  it("leaves out a value that the map does not know", () => {
    expect(parseMapFilters("?division=6&region=99&county=Atlantis", divisions, map)).toEqual(
      NO_FILTERS,
    )
    expect(parseMapFilters("", divisions, map)).toEqual(NO_FILTERS)
  })

  it("sets the division of a region given alone", () => {
    expect(parseMapFilters("?region=9", divisions, map)).toEqual({
      division: 3,
      region: 9,
      county: null,
    })
  })

  it("leaves out a region of another division", () => {
    expect(parseMapFilters("?division=2&region=9", divisions, map)).toEqual({
      division: 2,
      region: null,
      county: null,
    })
  })

  it("clears the region for a county outside it, as a choice on the page does", () => {
    expect(parseMapFilters("?division=2&region=7&county=Franklin", divisions, map)).toEqual({
      division: 2,
      region: null,
      county: "Franklin",
    })
  })

  it("uses the last value of a name that comes more than once", () => {
    expect(
      parseMapFilters(
        "?division=3&division=2&region=8&county=Stark&county=franklin",
        divisions,
        map,
      ),
    ).toEqual({ division: 2, region: 8, county: "Franklin" })
  })
})

describe("hasFilters", () => {
  it("is true when any one filter is set", () => {
    expect(hasFilters(NO_FILTERS)).toBe(false)
    expect(hasFilters({ ...NO_FILTERS, division: 1 })).toBe(true)
    expect(hasFilters({ ...NO_FILTERS, region: 1 })).toBe(true)
    expect(hasFilters({ ...NO_FILTERS, county: "Stark" })).toBe(true)
  })
})

describe("withDivision", () => {
  const chosen = { division: 2, region: 7, county: "Stark" }

  it("keeps a region of the same division and the county", () => {
    expect(withDivision(chosen, 2, divisions)).toEqual(chosen)
  })

  it("clears a region of another division", () => {
    expect(withDivision(chosen, 3, divisions)).toEqual({
      division: 3,
      region: null,
      county: "Stark",
    })
    expect(withDivision(chosen, null, divisions)).toEqual({
      division: null,
      region: null,
      county: "Stark",
    })
    expect(withDivision(NO_FILTERS, 3, divisions)).toEqual({ ...NO_FILTERS, division: 3 })
  })
})

describe("withRegion", () => {
  it("sets the region and its division", () => {
    expect(withRegion(NO_FILTERS, 9, divisions)).toEqual({ division: 3, region: 9, county: null })
  })

  it("clears the region and keeps the division", () => {
    expect(withRegion({ division: 3, region: 9, county: null }, null, divisions)).toEqual({
      division: 3,
      region: null,
      county: null,
    })
  })

  it("ignores a region that no division holds", () => {
    expect(withRegion(NO_FILTERS, 4, divisions)).toBe(NO_FILTERS)
  })
})

describe("withCounty", () => {
  it("sets or clears the county when no region is set", () => {
    expect(withCounty(NO_FILTERS, "Stark", map)).toEqual({ ...NO_FILTERS, county: "Stark" })
    expect(withCounty({ ...NO_FILTERS, county: "Stark" }, null, map)).toEqual(NO_FILTERS)
  })

  it("keeps the region when the county lies in it", () => {
    expect(withCounty({ division: 2, region: 7, county: null }, "Summit", map)).toEqual({
      division: 2,
      region: 7,
      county: "Summit",
    })
  })

  it("keeps the region when a school of the region is in the county", () => {
    const schools = [{ county: "Franklin", division: 2, region: 7 }]

    expect(withCounty({ division: 2, region: 7, county: null }, "Franklin", map, schools)).toEqual({
      division: 2,
      region: 7,
      county: "Franklin",
    })
    expect(
      parseMapFilters("?division=2&region=7&county=Franklin", divisions, map, schools),
    ).toEqual({ division: 2, region: 7, county: "Franklin" })
    expect(
      withCounty({ division: 2, region: 7, county: null }, "Franklin", map, [
        { county: "Franklin", division: 2, region: 8 },
        { county: "Franklin", division: 3, region: 7 },
      ]).region,
    ).toBeNull()
  })

  it("clears the region when the county lies outside it", () => {
    expect(withCounty({ division: 2, region: 7, county: null }, "Franklin", map)).toEqual({
      division: 2,
      region: null,
      county: "Franklin",
    })
    expect(withCounty({ division: 5, region: 17, county: null }, "Franklin", map)).toEqual({
      division: 5,
      region: null,
      county: "Franklin",
    })
  })
})

describe("matchingMarkers", () => {
  const ids = (filters: Parameters<typeof matchingMarkers>[1]) =>
    matchingMarkers(markers, filters).map((item) => item.id)

  it("keeps each school that matches every filter that is set", () => {
    expect(ids(NO_FILTERS)).toEqual(["a", "b", "c", "d", "e", "f"])
    expect(ids({ ...NO_FILTERS, division: 2 })).toEqual(["a", "c", "d"])
    expect(ids({ division: 2, region: 7, county: null })).toEqual(["a", "c"])
    expect(ids({ division: 2, region: 7, county: "Stark" })).toEqual(["a"])
    expect(ids({ ...NO_FILTERS, county: "Franklin" })).toEqual(["d", "e"])
    expect(ids({ division: 3, region: null, county: "Franklin" })).toEqual([])
  })
})

describe("selectedCounties", () => {
  it("is the county, else the counties of the region, else the whole state for a division", () => {
    expect([...selectedCounties({ division: 2, region: 7, county: "Stark" }, map)]).toEqual([
      "Stark",
    ])
    expect([...selectedCounties({ division: 2, region: 7, county: null }, map)]).toEqual([
      "Stark",
      "Summit",
    ])
    expect([...selectedCounties({ division: 2, region: null, county: null }, map)]).toEqual(
      counties,
    )
    expect([...selectedCounties(NO_FILTERS, map)]).toEqual([])
  })

  it("adds the county of each school of a region that lies outside the counties of the region", () => {
    expect([
      ...selectedCounties({ division: 2, region: 7, county: null }, map, [
        { county: "Franklin" },
        { county: null },
      ]),
    ]).toEqual(["Stark", "Summit", "Franklin"])
  })

  it("is empty for a region of a division that the map does not draw", () => {
    expect([...selectedCounties({ division: 6, region: 21, county: null }, map)]).toEqual([])
  })
})

describe("zoomTarget", () => {
  it("shows the whole state for a division alone and for no filter", () => {
    expect(zoomTarget(NO_FILTERS, map, [])).toEqual(wholeMap(map))
    expect(zoomTarget({ ...NO_FILTERS, division: 2 }, map, [])).toEqual(wholeMap(map))
  })

  it("holds the chosen counties and the schools that match", () => {
    const target = zoomTarget({ ...NO_FILTERS, county: "Stark" }, map, [
      { x: 900, y: 300, county: "Stark" },
    ])

    expect(target.x).toBeLessThan(680)
    expect(target.x + target.width).toBeGreaterThan(900)
    expect(target.width).toBeLessThan(map.width)
  })
})

describe("regionItems", () => {
  it("names the division of each region when no division is set", () => {
    expect(regionItems(divisions, null)).toEqual([
      { id: 7, label: "Region 7 · Division II" },
      { id: 8, label: "Region 8 · Division II" },
      { id: 9, label: "Region 9 · Division III" },
      { id: 11, label: "Region 11 · Division III" },
    ])
  })

  it("lists only the regions of the division", () => {
    expect(regionItems(divisions, 3)).toEqual([
      { id: 9, label: "Region 9" },
      { id: 11, label: "Region 11" },
    ])
  })
})
