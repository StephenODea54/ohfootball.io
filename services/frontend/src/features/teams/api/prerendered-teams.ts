import { PRERENDER_TEAM_LIMIT } from "astro:env/server"
import { getTeams } from "@/features/teams/api/get-teams"
import type { TeamSummary } from "@/types/api"

/**
 * The teams that get a page, best rated first. Each team is kept one time. With a limit, only the
 * first `limit` teams are kept. Without a limit, every team is kept.
 */
export function takePrerendered<T extends { id: string }>(
  teams: readonly T[],
  limit: number | undefined,
): T[] {
  const seen = new Set<string>()
  const distinct = teams.filter((team) => !seen.has(team.id) && seen.add(team.id))
  return limit ? distinct.slice(0, limit) : distinct
}

/**
 * The teams the build draws a page and a history file for. PRERENDER_TEAM_LIMIT keeps a build on
 * a laptop short. The team pages, the history files, and the compare pages all read this list, so
 * they always agree.
 */
export async function prerenderedTeams(): Promise<TeamSummary[]> {
  return takePrerendered(await getTeams(), PRERENDER_TEAM_LIMIT)
}
