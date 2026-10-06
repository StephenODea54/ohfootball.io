import type { PickemGamesFile } from "@/features/pickem/contract"
import { pickableGames } from "@/features/pickem/utils/pickable-games"
import { getCurrentSeason } from "@/features/seasons/api/get-current-season"
import { getTeam } from "@/features/teams/api/get-team"
import { getTeams } from "@/features/teams/api/get-teams"
import { prerenderedTeams } from "@/features/teams/api/prerendered-teams"
import { mapLimit } from "@/lib/map-limit"

/**
 * The most team requests that the games file sends at one time. The build draws other pages while
 * the file is written, so this stays below the eight pages that the build draws at once.
 */
const TEAM_REQUESTS_AT_ONCE = 4

/**
 * The games file of Pick 'Em, from the schedule of every team that gets a page. The team pages
 * read the same teams, and the build keeps each answer, so the file costs no extra request.
 */
export async function getPickableGames(now: Date = new Date()): Promise<PickemGamesFile> {
  const [season, drawn, allTeams] = await Promise.all([
    getCurrentSeason(),
    prerenderedTeams(),
    getTeams(),
  ])
  const teams = await mapLimit(drawn, TEAM_REQUESTS_AT_ONCE, (team) => getTeam(team.id, season))
  return pickableGames(teams, allTeams, season, now)
}
