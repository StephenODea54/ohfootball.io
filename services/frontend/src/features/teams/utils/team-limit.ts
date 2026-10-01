/** Largest number of teams the API returns for one season. */
export const TEAM_QUERY_LIMIT = 1000

/**
 * Stops the build when the list of a season fills the cap of the API.
 *
 * A season that fills the cap has teams the build never hears about, and those pages would be
 * missing from the site without a word.
 */
export function assertBelowTeamLimit(season: number, count: number) {
  if (count >= TEAM_QUERY_LIMIT) {
    throw new Error(
      `season ${season} returned ${count} teams, which fills the cap of ` +
        `${TEAM_QUERY_LIMIT}. Raise the cap in the API before building the site.`,
    )
  }
}

/**
 * The ids of the teams whose pages the build draws, each one time, in the order of the list. A
 * build on a laptop can draw only the first few pages, so a link to a team must check this list.
 */
export function drawnTeamIds(teams: readonly { id: string }[], limit?: number): string[] {
  const ids = [...new Set(teams.map((team) => team.id))]
  return limit ? ids.slice(0, limit) : ids
}
