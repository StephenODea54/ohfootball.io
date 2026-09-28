import { once } from "@/lib/build-cache"
import { graphqlRequest } from "@/lib/graphql-client"

/** The season the API considers current. The site shows this season and no other. */
export function getCurrentSeason(): Promise<number> {
  return once("currentSeason", async () => {
    const data = await graphqlRequest<{ currentSeason: number }>(`
      query CurrentSeason {
        currentSeason
      }
    `)
    return data.currentSeason
  })
}
