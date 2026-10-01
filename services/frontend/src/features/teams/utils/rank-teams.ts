import { compareItems, rankItem } from "@tanstack/match-sorter-utils"

/**
 * The best matches of a name search, best first, at most `limit`. With no query, the first
 * `limit` teams keep their order.
 */
export function rankTeams<T extends { name: string }>(
  teams: readonly T[],
  query: string,
  limit: number,
): T[] {
  const search = query.trim()
  if (!search) return teams.slice(0, limit)

  return teams
    .map((team) => ({ team, ranking: rankItem(team.name, search) }))
    .filter(({ ranking }) => ranking.passed)
    .sort((first, second) => compareItems(first.ranking, second.ranking))
    .slice(0, limit)
    .map(({ team }) => team)
}
