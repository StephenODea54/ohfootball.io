import { queryOptions } from "@tanstack/react-query"
import { graphqlRequest } from "@/lib/graphql-client"

/**
 * Every season the API holds data for, newest first. The site offers these and no others, so a
 * season with no teams is never a choice a visitor can make.
 */
export async function getSeasons(): Promise<number[]> {
  const data = await graphqlRequest<{ seasons: number[] }>(`
    query Seasons {
      seasons
    }
  `)
  return data.seasons
}

export function getSeasonsQueryOptions() {
  return queryOptions({
    queryKey: ["seasons"] as const,
    queryFn: getSeasons,
  })
}
