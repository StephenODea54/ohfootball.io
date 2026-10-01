import type { SeasonPoint } from "@/features/compare/types"

/** One season of the chart and of the season table. A program that did not play has null. */
export interface CompareRow {
  season: number
  a: number | null
  b: number | null
  rankA: number | null
  rankB: number | null
}

/** One row for every season from the first to the last season either program played. */
export function mergeSeasonSeries(
  a: readonly SeasonPoint[],
  b: readonly SeasonPoint[],
): CompareRow[] {
  const byA = new Map(a.map((point) => [point.season, point]))
  const byB = new Map(b.map((point) => [point.season, point]))
  const seasons = [...byA.keys(), ...byB.keys()]
  if (seasons.length === 0) return []

  const first = Math.min(...seasons)
  const last = Math.max(...seasons)
  return Array.from({ length: last - first + 1 }, (_, index) => {
    const season = first + index
    const pointA = byA.get(season)
    const pointB = byB.get(season)
    return {
      season,
      a: pointA?.rating ?? null,
      b: pointB?.rating ?? null,
      rankA: pointA?.rank ?? null,
      rankB: pointB?.rank ?? null,
    }
  })
}

/** The range of the rating axis and the values it marks. */
export interface RatingAxis {
  domain: [number, number]
  ticks: number[]
}

/**
 * The rating axis. It holds 0, leaves at least five points of room on each side, and starts and
 * ends on a tick, so each tick is a round number. With no data it shows 50 points each way, as the chart of
 * a team does.
 */
export function ratingAxis(rows: readonly CompareRow[]): RatingAxis {
  const values = rows.flatMap((row) => [row.a, row.b]).filter((value) => value !== null)
  // 0 is the median team, and the chart marks it, so the axis always holds it.
  const low = values.length > 0 ? Math.min(0, ...values) - 5 : -50
  const high = values.length > 0 ? Math.max(0, ...values) + 5 : 50
  const span = high - low
  const step = span <= 60 ? 10 : span <= 120 ? 20 : 40
  const first = Math.floor(low / step) * step
  const last = Math.ceil(high / step) * step
  const ticks = Array.from(
    { length: (last - first) / step + 1 },
    (_, index) => first + index * step,
  )
  return { domain: [first, last], ticks }
}
