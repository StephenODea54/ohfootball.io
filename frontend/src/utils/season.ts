export interface SeasonSearch {
  season?: number
}

/**
 * Reads the season from the URL search parameters. The season is validated on the root route, so
 * every page in the site receives the same value.
 *
 * A missing or unreadable season is left out rather than replaced with a guess. The API then
 * answers with the season it considers current, which keeps the site in step with the data even
 * when the data lags behind the calendar.
 */
export function validateSeasonSearch(search: Record<string, unknown>): SeasonSearch {
  const value = Number(search.season)
  return Number.isInteger(value) ? { season: value } : {}
}
