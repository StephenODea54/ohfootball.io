import { getMapTeams } from "@/features/map/api/get-map-teams"
import { countyMap } from "@/features/map/server/county-map"
import { loadedTeamIds, playoffMapData } from "@/features/playoff-map/server/playoff-map"
import type { PlayoffMapData } from "@/features/playoff-map/types"
import { seedsAreSet } from "@/features/playoff-map/utils/seeds"
import { getPlayoffProjection } from "@/features/playoffs/api/get-playoff-projection"
import { getCurrentSeason } from "@/features/seasons/api/get-current-season"
import { getTeam } from "@/features/teams/api/get-team"
import { once } from "@/lib/build-cache"
import { mapLimit } from "@/lib/map-limit"

/** The schedules that load at one time. It is the number that the page builder uses. */
const SCHEDULE_REQUESTS = 4

/**
 * The playoff map of the current season, or null while the map is closed.
 *
 * The map opens when the newest projection was made after the regular season, so the projection
 * gives the seeds. The schedules of the teams near the top of each region give the playoff games. The
 * build reads the same schedules for the team pages, so they cost no more requests in a full
 * build.
 *
 * Any error closes the map with a warning in the log of the build, so the rest of the site still
 * builds.
 */
export function getPlayoffMap(): Promise<PlayoffMapData | null> {
  return once("playoffMap", async () => {
    try {
      const [projection, season] = await Promise.all([getPlayoffProjection(), getCurrentSeason()])
      if (!projection || projection.season !== season) return null
      if (!seedsAreSet(projection)) return null

      const ids = [...new Set(projection.regions.flatMap(loadedTeamIds))]
      const [teams, loaded] = await Promise.all([
        getMapTeams(),
        mapLimit(ids, SCHEDULE_REQUESTS, (id) =>
          getTeam(id, season).then(
            (team) => team.schedule,
            // One team that does not load keeps no games, and the rest of the map still builds.
            (error) => {
              console.warn(`The playoff map has no schedule of team ${id}: ${String(error)}`)
              return []
            },
          ),
        ),
      ])
      const schedules = new Map(ids.map((id, index) => [id, loaded[index]]))
      return playoffMapData(projection, schedules, teams, countyMap(teams))
    } catch (error) {
      console.warn(`The playoff map is left out of this build: ${String(error)}`)
      return null
    }
  })
}
