import type { SeasonPoint } from "@/features/compare/types"
import type { TeamRating } from "@/types/api"

/**
 * The last snapshot of each season, oldest season first. A past season ends with a snapshot on
 * 31 December. The season in progress has only its weekly snapshots, so its point is the newest.
 */
export function seasonEndPoints(
  history: readonly Omit<TeamRating, "previousRank">[],
): SeasonPoint[] {
  const last = new Map<number, Omit<TeamRating, "previousRank">>()
  for (const point of history) {
    const kept = last.get(point.season)
    if (!kept || point.asOf > kept.asOf) last.set(point.season, point)
  }
  return [...last.values()]
    .sort((first, second) => first.season - second.season)
    .map((point) => ({
      season: point.season,
      rating: point.value,
      rank: point.rank,
      asOf: point.asOf,
    }))
}

/** True when the point is not the end of its season, so the season was still in progress. */
export function isSeasonInProgress(point: Pick<SeasonPoint, "asOf">): boolean {
  return !point.asOf.endsWith("-12-31")
}

/**
 * The label of each season for the chart and the table. The current season reads "2026 so far"
 * while a program has only a weekly snapshot of it.
 */
export function seasonLabeler(
  currentSeason: number,
  programs: readonly { seasons: readonly SeasonPoint[] }[],
): (season: number) => string {
  const inProgress = programs.some((program) => {
    const point = program.seasons.at(-1)
    return point?.season === currentSeason && isSeasonInProgress(point)
  })
  return (season) => (season === currentSeason && inProgress ? `${season} so far` : `${season}`)
}
