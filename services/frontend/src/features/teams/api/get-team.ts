import { queryOptions } from "@tanstack/react-query"
import { teamFields } from "@/features/teams/api/team-fields"
import { graphqlRequest } from "@/lib/graphql-client"
import type { Team } from "@/types/api"

export async function getTeam(id: string, season?: number): Promise<Team> {
  const data = await graphqlRequest<{ team: Team | null }>(
    `
      query Team($id: ID!, $season: Int) {
        team(id: $id, season: $season) {
          ${teamFields}
          ratingHistory: eloHistory { season value: rating rank asOf }
          schedule {
            id
            week
            date
            opponentId
            opponentName
            location
            result
            teamScore
            opponentScore
            playoff
            notes
            prediction {
              winProbability
              predictedResult
              teamRating
              opponentRating
              asOf
            }
          }
        }
      }
    `,
    { id, season },
  )
  if (!data.team) throw new Error("Team not found")
  return data.team
}

export function getTeamQueryOptions(id: string, season?: number) {
  return queryOptions({
    queryKey: ["team", id, season] as const,
    queryFn: () => getTeam(id, season),
  })
}
