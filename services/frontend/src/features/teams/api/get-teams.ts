import { getCurrentSeason } from "@/features/seasons/api/get-current-season"
import { teamFields } from "@/features/teams/api/team-fields"
import { once } from "@/lib/build-cache"
import { graphqlRequest } from "@/lib/graphql-client"
import type { TeamSummary } from "@/types/api"

/** Largest number of teams the API returns for one season. */
const TEAM_QUERY_LIMIT = 1000

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
          teams(season: $season, sort: ELO, limit: ${TEAM_QUERY_LIMIT}) {
            ${teamFields}
          }
        }
      `,
      { season },
    )

    // The API caps what one question returns. A season that fills the cap has teams the build
    // never hears about, and those pages would be missing from the site without a word.
    if (data.teams.length >= TEAM_QUERY_LIMIT) {
      throw new Error(
        `season ${season} returned ${data.teams.length} teams, which fills the cap of ` +
          `${TEAM_QUERY_LIMIT}. Raise the cap in the API before building the site.`,
      )
    }
    return data.teams
  })
}
