import { QueryClient } from "@tanstack/react-query"

/**
 * Ratings are recalculated once a day at most, so moving between pages should read the cache
 * rather than ask the API again.
 */
const ONE_HOUR = 60 * 60 * 1000

export const queryConfig = {
  queries: {
    staleTime: ONE_HOUR,
  },
}

export function getContext() {
  const queryClient = new QueryClient({ defaultOptions: queryConfig })

  return {
    queryClient,
  }
}
