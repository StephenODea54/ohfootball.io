/**
 * Builds the list of addresses the site is drawn for ahead of time.
 *
 * The static routes are found by the plugin itself. A team page cannot be, because its address
 * carries a key that only the data knows, so every one of them is asked for here. There is one
 * team page for each season a program has played, which is about forty thousand pages in all.
 *
 * This runs while the site is being built, against the API that was published just before it. It
 * is not part of the site and never reaches a browser.
 */

/** Largest number of teams the API returns for one season. */
const TEAM_QUERY_LIMIT = 1000

export interface PrerenderPage {
  path: string
}

async function query<T>(endpoint: string, document: string): Promise<T> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: document }),
  })
  if (!response.ok) {
    throw new Error(`${endpoint} answered ${response.status} for ${document}`)
  }
  const body = (await response.json()) as { data?: T; errors?: unknown }
  if (body.errors || !body.data) {
    throw new Error(`${endpoint} reported ${JSON.stringify(body.errors)}`)
  }
  return body.data
}

/**
 * Returns one address for every team season the API knows about.
 *
 * A cap can be set to keep a build on a laptop short. Leave it unset for a build that publishes.
 */
export async function teamPages(endpoint: string, cap?: number): Promise<PrerenderPage[]> {
  const { seasons } = await query<{ seasons: number[] }>(endpoint, '{ seasons }')

  const paths = new Set<string>()
  for (const season of seasons) {
    const { teams } = await query<{ teams: Array<{ id: string }> }>(
      endpoint,
      `{ teams(season: ${season}, limit: ${TEAM_QUERY_LIMIT}) { id } }`,
    )
    // The API caps what one question returns. A season that fills the cap has teams the build
    // never hears about, and those pages would be missing from the site without a word.
    if (teams.length >= TEAM_QUERY_LIMIT) {
      throw new Error(
        `season ${season} returned ${teams.length} teams, which fills the cap of ` +
          `${TEAM_QUERY_LIMIT}. Raise the cap in the API before building the site.`,
      )
    }
    for (const team of teams) {
      paths.add(`/teams/${team.id}`)
      if (cap && paths.size >= cap) {
        return [...paths].map((path) => ({ path }))
      }
    }
  }
  return [...paths].map((path) => ({ path }))
}
