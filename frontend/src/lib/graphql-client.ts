import { env } from "@/config/env"

/**
 * The single place the front end talks to the API. Every feature goes through this function, so
 * the transport can be swapped without touching the code that asks for data.
 */

const DEFAULT_URL = "http://localhost:8082/graphql"

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

export async function graphqlRequest<T>(query: string, variables?: object): Promise<T> {
  const response = await fetch(env.VITE_GRAPHQL_URL ?? DEFAULT_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  })
  if (!response.ok) throw new Error(`GraphQL request failed with status ${response.status}`)

  const payload = (await response.json()) as GraphQLResponse<T>
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "))
  if (!payload.data) throw new Error("GraphQL response did not include data")
  return payload.data
}
