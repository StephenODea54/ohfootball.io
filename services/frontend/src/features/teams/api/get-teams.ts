import { getCurrentSeason } from "@/features/seasons/api/get-current-season"
import { teamFields } from "@/features/teams/api/team-fields"
import { assertBelowTeamLimit, TEAM_QUERY_LIMIT } from "@/features/teams/utils/team-limit"
import { once } from "@/lib/build-cache"
import { graphqlRequest } from "@/lib/graphql-client"
import type { TeamSummary } from "@/types/api"

/**
 * Every team of the current season, best rated first. The home page, the leaderboard, and the
 * list of team pages all read this one answer.
 */
export function getTeams(): Promise<TeamSummary[]> {
  return once("teams", async () => {
    const season = await getCurrentSeason()
    const data = await graphqlRequest<{ teams: TeamSummary[] }>(
      `
        query Teams($season: Int!) {
          teams(season: $season, sort: RATING, limit: ${TEAM_QUERY_LIMIT}) {
            ${teamFields}
          }
        }
      `,
      { season },
    )

    assertBelowTeamLimit(season, data.teams.length)
    return data.teams
  })
}
