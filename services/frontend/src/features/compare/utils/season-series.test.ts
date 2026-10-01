import { describe, expect, it } from "vitest"
import type { SeasonPoint } from "@/features/compare/types"
import { mergeSeasonSeries, ratingAxis } from "@/features/compare/utils/season-series"

function point(season: number, rating: number, rank = 1): SeasonPoint {
  return { season, rating, rank, asOf: `${season}-12-31` }
}

describe("mergeSeasonSeries", () => {
  it("gives a row with null for a season that a program did not play", () => {
    const rows = mergeSeasonSeries([point(2000, 5, 3), point(2002, 7, 2)], [point(2001, 1, 9)])
    expect(rows).toEqual([
      { season: 2000, a: 5, b: null, rankA: 3, rankB: null },
      { season: 2001, a: null, b: 1, rankA: null, rankB: 9 },
      { season: 2002, a: 7, b: null, rankA: 2, rankB: null },
    ])
  })

  it("starts at the first season of either program", () => {
    const rows = mergeSeasonSeries([point(1990, 1)], [point(1988, 2), point(1990, 3)])
    expect(rows.map((row) => row.season)).toEqual([1988, 1989, 1990])
  })

  it("follows one program when the other has no seasons", () => {
    expect(mergeSeasonSeries([], [point(2025, 4, 8)])).toEqual([
      { season: 2025, a: null, b: 4, rankA: null, rankB: 8 },
    ])
  })

  it("gives no rows when neither program has a season", () => {
    expect(mergeSeasonSeries([], [])).toEqual([])
  })
})

describe("ratingAxis", () => {
  it("leaves room on each side and ends on round ticks", () => {
    const rows = mergeSeasonSeries([point(2000, 12.4)], [point(2000, -20.6)])
    expect(ratingAxis(rows)).toEqual({ domain: [-30, 20], ticks: [-30, -20, -10, 0, 10, 20] })
  })

  it("takes a larger step for a wide range", () => {
    const rows = mergeSeasonSeries([point(2000, 60)], [point(2000, -20)])
    expect(ratingAxis(rows)).toEqual({ domain: [-40, 80], ticks: [-40, -20, 0, 20, 40, 60, 80] })
    const wide = mergeSeasonSeries([point(2000, 90)], [point(2000, -60)])
    expect(ratingAxis(wide).ticks).toEqual([-80, -40, 0, 40, 80, 120])
  })

  it("holds 0 when every rating is above or below it", () => {
    const strong = mergeSeasonSeries([point(2000, 30)], [point(2000, 55)])
    expect(ratingAxis(strong).domain).toEqual([-20, 60])
    const weak = mergeSeasonSeries([point(2000, -30)], [])
    expect(ratingAxis(weak).domain).toEqual([-40, 10])
  })

  it("shows 50 points each way with no data", () => {
    const empty = { domain: [-60, 60], ticks: [-60, -40, -20, 0, 20, 40, 60] }
    expect(ratingAxis([])).toEqual(empty)
    expect(ratingAxis([{ season: 2000, a: null, b: null, rankA: null, rankB: null }])).toEqual(
      empty,
    )
  })
})
