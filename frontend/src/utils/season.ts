export const FIRST_SEASON = 2000
export const CURRENT_SEASON = new Date().getFullYear()

/** Every selectable season, newest first. */
export const SEASONS = Array.from(
  { length: CURRENT_SEASON - FIRST_SEASON + 1 },
  (_, index) => CURRENT_SEASON - index,
)

export interface SeasonSearch {
  season: number
}

/**
 * Reads the season from the URL search parameters. The season is validated on the root route, so
 * every page in the site receives the same value. An absent or out-of-range season falls back to
 * the current season.
 */
export function validateSeasonSearch(search: Record<string, unknown>): SeasonSearch {
  const value = Number(search.season)
  const season = Number.isInteger(value) && value >= FIRST_SEASON && value <= CURRENT_SEASON
    ? value
    : CURRENT_SEASON

  return { season }
}
