export const FIRST_SEASON = 2000
export const CURRENT_SEASON = new Date().getFullYear()

export function validateSeasonSearch(search: Record<string, unknown>) {
  const value = Number(search.season)
  const season = Number.isInteger(value) && value >= FIRST_SEASON && value <= CURRENT_SEASON
    ? value
    : CURRENT_SEASON

  return { season }
}
