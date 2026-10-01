import { getCurrentSeason } from "@/features/seasons/api/get-current-season"
import { assertBelowTeamLimit, TEAM_QUERY_LIMIT } from "@/features/teams/utils/team-limit"
import { once } from "@/lib/build-cache"
import { graphqlRequest } from "@/lib/graphql-client"

/** A team as the map query returns it. */
export interface MapTeam {
  id: string
  /** The joeeitel.com team number, which names the logo file. */
  sourceId: string
  name: string
  /** The Ohio county of the school without the word County, such as Stark. */
  county: string | null
  primaryColor: string | null
  secondaryColor: string | null
  rating: { value: number; rank: number } | null
  coordinates: { latitude: number; longitude: number } | null
}

/** Every team of the current season with only the fields that the map of the home page draws. */
export function getMapTeams(): Promise<MapTeam[]> {
  return once("map-teams", async () => {
    const season = await getCurrentSeason()
    const data = await graphqlRequest<{ teams: MapTeam[] }>(
      `
        query MapTeams($season: Int!) {
          teams(season: $season, sort: RATING, limit: ${TEAM_QUERY_LIMIT}) {
            id
            sourceId
            name
            county
            primaryColor
            secondaryColor
            rating { value: relativeRating rank }
            coordinates { latitude longitude }
          }
        }
      `,
      { season },
    )

    assertBelowTeamLimit(season, data.teams.length)
    return data.teams
  })
}
