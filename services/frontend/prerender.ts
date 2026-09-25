/**
 * Builds the list of addresses the site is drawn for ahead of time.
 *
 * The static routes are found by the plugin itself. A team page cannot be, because its address
 * carries a key that only the data knows, so every one of them is asked for here.
 *
 * Only the current season is drawn. A team page address holds no season, so the page a visitor
 * reads first is always the current season of that team, and a page for any other season is drawn
 * in the browser from the season the address carries in its search. Drawing every season a program
 * has played would build about forty thousand pages that no address reaches.
 *
 * A team that did not play the current season therefore has no page of its own. Cloudflare Pages
 * answers that address with the application and a 404, and the application draws the team from
 * the API. The page works, and a crawler is told the page is not part of the site.
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
 * Returns one address for every team of the season the API considers current.
 *
 * A cap can be set to keep a build on a laptop short. Leave it unset for a build that publishes.
 */
export async function teamPages(endpoint: string, cap?: number): Promise<PrerenderPage[]> {
  const { currentSeason } = await query<{ currentSeason: number }>(endpoint, '{ currentSeason }')

  const { teams } = await query<{ teams: Array<{ id: string }> }>(
    endpoint,
    `{ teams(season: ${currentSeason}, limit: ${TEAM_QUERY_LIMIT}) { id } }`,
  )
  // The API caps what one question returns. A season that fills the cap has teams the build never
  // hears about, and those pages would be missing from the site without a word.
  if (teams.length >= TEAM_QUERY_LIMIT) {
    throw new Error(
      `season ${currentSeason} returned ${teams.length} teams, which fills the cap of ` +
        `${TEAM_QUERY_LIMIT}. Raise the cap in the API before building the site.`,
    )
  }

  const paths = new Set<string>()
  for (const team of teams) {
    paths.add(`/teams/${team.id}`)
    if (cap && paths.size >= cap) break
  }
  return [...paths].map((path) => ({ path }))
}
