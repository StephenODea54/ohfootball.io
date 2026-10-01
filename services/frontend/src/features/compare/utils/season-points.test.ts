import { describe, expect, it } from "vitest"
import {
  isSeasonInProgress,
  seasonEndPoints,
  seasonLabeler,
} from "@/features/compare/utils/season-points"
import type { TeamRating } from "@/types/api"

function rating(season: number, asOf: string, value = 1, rank = 1): TeamRating {
  return { season, value, rank, previousRank: null, asOf }
}

describe("seasonEndPoints", () => {
  it("keeps the later snapshot of a season", () => {
    expect(
      seasonEndPoints([rating(2026, "2026-09-29", 12, 4), rating(2026, "2026-09-21", 8, 9)]),
    ).toEqual([{ season: 2026, rating: 12, rank: 4, asOf: "2026-09-29" }])
  })

  it("sorts the seasons, oldest first", () => {
    const points = seasonEndPoints([
      rating(2025, "2025-12-31"),
      rating(1972, "1972-12-31"),
      rating(2001, "2001-12-31"),
    ])
    expect(points.map((point) => point.season)).toEqual([1972, 2001, 2025])
  })

  it("gives nothing for an empty history", () => {
    expect(seasonEndPoints([])).toEqual([])
  })
})

describe("isSeasonInProgress", () => {
  it("tells the end of a season from a weekly snapshot", () => {
    expect(isSeasonInProgress({ asOf: "2025-12-31" })).toBe(false)
    expect(isSeasonInProgress({ asOf: "2026-09-29" })).toBe(true)
  })
})

describe("seasonLabeler", () => {
  const past = { season: 2025, rating: 1, rank: 1, asOf: "2025-12-31" }
  const current = { season: 2026, rating: 1, rank: 1, asOf: "2026-09-29" }

  it("marks the season in progress", () => {
    const label = seasonLabeler(2026, [{ seasons: [past] }, { seasons: [past, current] }])
    expect(label(2026)).toBe("2026 so far")
    expect(label(2025)).toBe("2025")
  })

  it("marks nothing when the current season has ended", () => {
    const ended = { ...current, asOf: "2026-12-31" }
    expect(seasonLabeler(2026, [{ seasons: [ended] }])(2026)).toBe("2026")
    expect(seasonLabeler(2026, [{ seasons: [] }])(2026)).toBe("2026")
  })
})
