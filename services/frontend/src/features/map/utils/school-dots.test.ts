import { describe, expect, it } from "vitest"
import type { MapTeam } from "@/features/map/api/get-map-teams"
import { ohioMap } from "@/features/map/server/ohio-map"
import { programCount, schoolDots } from "@/features/map/utils/school-dots"

const map = ohioMap()

function team(id: string, rank: number | null): MapTeam {
  return {
    id,
    sourceId: id,
    name: id,
    county: null,
    primaryColor: null,
    secondaryColor: null,
    rating: rank === null ? null : { value: 40 - rank, rank },
    coordinates: { latitude: 40, longitude: -83 },
  }
}

describe("schoolDots", () => {
  const dots = schoolDots(
    [
      team("best", 1),
      team("last", 3),
      team("unrated", null),
      { ...team("lost", 2), coordinates: null },
    ],
    map.fit,
  )

  it("makes a dot of every school with a location", () => {
    expect(dots.map((dot) => dot.id).sort()).toEqual(["best", "last", "unrated"])
  })

  it("draws the best school last, biggest, and brightest", () => {
    const best = dots.at(-1)
    expect(best?.id).toBe("best")
    expect(best?.opacity).toBe(1)
    for (const dot of dots.slice(0, -1)) {
      expect(dot.radius).toBeLessThan(best?.radius ?? 0)
    }
    expect(dots.find((dot) => dot.id === "unrated")?.opacity).toBe(0.35)
  })

  it("never makes a dot smaller than the faintest rated dot", () => {
    // The state has 50 rated schools, but only two of them have a location here.
    const [far] = schoolDots([team("far", 50), team("best", 1)], map.fit)
    expect(far).toMatchObject({ id: "far", radius: 2.4, opacity: 0.5 })
  })

  it("lets only some dots twinkle, each at its own time", () => {
    const many = schoolDots(
      Array.from({ length: 12 }, (_, index) => team(`team-${index}`, index + 1)),
      map.fit,
    )
    const twinkling = many.filter((dot) => dot.twinkleDelay !== null)
    expect(twinkling).toHaveLength(2)
    expect(new Set(twinkling.map((dot) => dot.twinkleDelay)).size).toBe(2)
  })
})

describe("programCount", () => {
  it("rounds down to fifty for a headline", () => {
    expect(programCount(703)).toBe("700+")
    expect(programCount(749)).toBe("700+")
    expect(programCount(42)).toBe("42")
  })
})
