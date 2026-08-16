import { useLoaderData } from "@tanstack/react-router"

/**
 * The seasons the API holds, newest first. The root route loads them once, so every page reads the
 * same list without asking again.
 */
export function useSeasons(): number[] {
  return useLoaderData({ from: "__root__", select: (data) => data.seasons })
}

/**
 * The season a page should show. A visitor who picks a season keeps it. A visitor who arrives
 * without one sees the newest season the API holds.
 */
export function useSelectedSeason(season: number | undefined): number | undefined {
  const seasons = useSeasons()
  return season ?? seasons.at(0)
}
