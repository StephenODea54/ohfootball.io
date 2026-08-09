import { queryOptions } from "@tanstack/react-query"
import { type FetchTeamsOptions, fetchTeam, fetchTeams } from "@/lib/graphql"

/**
 * Ratings are recalculated once a day at most, so moving between pages should read the cache
 * rather than ask the API again. Route loaders share these options, which means the home page and
 * the leaderboard resolve to the same cache entry for a given season.
 */
const ONE_HOUR = 60 * 60 * 1000

export function teamsQuery(options: FetchTeamsOptions = {}) {
  return queryOptions({
    queryKey: ["teams", options] as const,
    queryFn: () => fetchTeams(options),
    staleTime: ONE_HOUR,
  })
}

export function teamQuery(id: string, season?: number) {
  return queryOptions({
    queryKey: ["team", id, season] as const,
    queryFn: () => fetchTeam(id, season),
    staleTime: ONE_HOUR,
  })
}
