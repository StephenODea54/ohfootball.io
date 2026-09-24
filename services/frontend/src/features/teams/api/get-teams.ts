import { queryOptions } from "@tanstack/react-query"
import { teamFields } from "@/features/teams/api/team-fields"
import { graphqlRequest } from "@/lib/graphql-client"
import type { Team } from "@/types/api"

export interface GetTeamsOptions {
  season?: number
  search?: string
  region?: number
  division?: number
}

export async function getTeams(options: GetTeamsOptions = {}): Promise<Team[]> {
  const data = await graphqlRequest<{ teams: Team[] }>(
    `
      query Teams($season: Int, $search: String, $region: Int, $division: Int) {
        teams(
          season: $season
          search: $search
          region: $region
          division: $division
          sort: ELO
          limit: 1000
        ) {
          ${teamFields}
        }
      }
    `,
    options,
  )
  return data.teams.map((team) => ({ ...team, ratingHistory: [], schedule: [] }))
}

/**
 * Route loaders share these options, which means the home page and the leaderboard resolve to the
 * same cache entry for a given season.
 */
export function getTeamsQueryOptions(options: GetTeamsOptions = {}) {
  return queryOptions({
    queryKey: ["teams", options] as const,
    queryFn: () => getTeams(options),
  })
}
