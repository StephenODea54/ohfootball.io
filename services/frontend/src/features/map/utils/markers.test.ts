import { describe, expect, it } from "vitest"
import type { MapTeam } from "@/features/map/api/get-map-teams"
import { countyTints, mapMarkers } from "@/features/map/utils/markers"
import { project } from "@/features/map/utils/projection"

const fit = { scale: 20_000, x: -5000, y: -7000 }

function team(id: string, rank: number | null, overrides: Partial<MapTeam> = {}): MapTeam {
  return {
    id,
    sourceId: id,
    name: `School ${id}`,
    county: "Stark",
    division: 2,
    region: 7,
    primaryColor: "#CC0000",
    secondaryColor: null,
    rating: rank === null ? null : { value: 40.04 - rank, rank },
    coordinates: { latitude: 40.8, longitude: -81.4 },
    ...overrides,
  }
}

describe("mapMarkers", () => {
  const markers = mapMarkers(
    [
      team("1", 1),
      team("unrated", null),
      team("lost", 3, { coordinates: null }),
      team("2", 2, { primaryColor: "#000000", secondaryColor: null }),
    ],
    fit,
  )

  it("keeps only rated schools with a location, best rated last", () => {
    expect(markers.map((marker) => marker.id)).toEqual(["2", "1"])
  })

  it("places each school with one decimal and keeps the fields that the map needs", () => {
    const place = project(fit, -81.4, 40.8)
    expect(markers[1]).toEqual({
      id: "1",
      sourceId: "1",
      name: "School 1",
      county: "Stark",
      division: 2,
      region: 7,
      rank: 1,
      rating: 39,
      x: Math.round(place.x * 10) / 10,
      y: Math.round(place.y * 10) / 10,
      color: "#CC0000",
    })
  })

  it("gives no color to a school whose colors do not show on both themes", () => {
    expect(markers[0].color).toBeNull()
  })

  it("leaves out a school whose location gives no number", () => {
    const bad = team("bad", 4, { coordinates: { latitude: Number.NaN, longitude: -81.4 } })

    expect(mapMarkers([bad, team("1", 1)], fit).map((marker) => marker.id)).toEqual(["1"])
  })
})

describe("countyTints", () => {
  it("colors each county with its best rated school, and leaves out a county without a color", () => {
    const tints = countyTints([
      { county: "Stark", rank: 9, color: "#00AA00" },
      { county: "Stark", rank: 2, color: "#CC0000" },
      { county: "Stark", rank: 5, color: "#0000CC" },
      { county: "Summit", rank: 3, color: null },
      { county: "Summit", rank: 30, color: "#0000CC" },
      { county: null, rank: 1, color: "#123456" },
    ])

    expect([...tints]).toEqual([["Stark", "#CC0000"]])
  })
})
