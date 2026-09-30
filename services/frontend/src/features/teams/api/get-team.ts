import { teamFields } from "@/features/teams/api/team-fields"
import { graphqlRequest } from "@/lib/graphql-client"
import type { Team } from "@/types/api"

/** One team in one season, with its rating history and its schedule. */
export async function getTeam(id: string, season: number): Promise<Team> {
  const data = await graphqlRequest<{ team: Team | null }>(
    `
      query Team($id: ID!, $season: Int) {
        team(id: $id, season: $season) {
          ${teamFields}
          ratingHistory { season value: relativeRating rank asOf }
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
              predictedMargin
              asOf
            }
          }
        }
      }
    `,
    { id, season },
  )
  if (!data.team) throw new Error(`the API has no team ${id} in season ${season}`)
  return data.team
}
