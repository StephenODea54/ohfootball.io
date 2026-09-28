/**
 * The single place the site talks to the API. Only the build and the development server run this
 * code. No page and no script that a browser loads holds the address of the API or its key.
 */

import { GRAPHQL_API_KEY, GRAPHQL_URL } from "astro:env/server"

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

/**
 * The API asks each caller to name a contact. The build key lets the build skip that rule and the
 * rate limits, but a build without a key, such as one on a laptop, still needs the contact.
 */
export const userAgent = "ohfootball.io site build (https://ohfootball.io)"

export async function graphqlRequest<T>(query: string, variables?: object): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": userAgent,
  }
  // The build key lets the build skip the rate limits. The header is sent only when a key is set.
  if (GRAPHQL_API_KEY) headers.authorization = `Bearer ${GRAPHQL_API_KEY}`

  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  })
  if (!response.ok) throw new Error(`GraphQL request failed with status ${response.status}`)

  const payload = (await response.json()) as GraphQLResponse<T>
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "))
  if (!payload.data) throw new Error("GraphQL response did not include data")
  return payload.data
}
