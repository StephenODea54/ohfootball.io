import type { MapTeam } from "@/features/map/api/get-map-teams"
import type { CountyMap } from "@/features/map/server/county-map"
import { areaShape } from "@/features/map/utils/polygon"
import { project } from "@/features/map/utils/projection"
import { teamColor } from "@/features/map/utils/team-color"
import { type Bounds, unionBounds } from "@/features/map/utils/zoom"
import { seededTerritories } from "@/features/playoff-map/server/seeded-territories"
import type {
  PlayoffMapData,
  PlayoffMapDivision,
  PlayoffMapRegion,
  PlayoffRound,
} from "@/features/playoff-map/types"
import { firstRoundWeek, regionGames, type Schedules } from "@/features/playoff-map/utils/rounds"
import { CANDIDATES, regionSeeds } from "@/features/playoff-map/utils/seeds"
import type { PlayoffProjection, PlayoffRegion } from "@/features/playoffs/types"

/** The ids of the teams of a region whose schedules the map reads. */
export function loadedTeamIds(region: PlayoffRegion): string[] {
  return region.teams.slice(0, CANDIDATES).map((team) => team.teamId)
}

/**
 * Builds the playoff map: for each region, its 12 playoff teams, the land of each team, and the
 * playoff games of the region. It runs only in the build.
 *
 * A region that fails is left out with a warning in the log, so one bad region does not stop the
 * map of the other regions.
 */
export function playoffMapData(
  projection: PlayoffProjection,
  schedules: Schedules,
  teams: readonly MapTeam[],
  map: CountyMap,
): PlayoffMapData {
  const teamsById = new Map(teams.map((team) => [team.id, team]))
  const firstWeek = firstRoundWeek(schedules)
  const divisions = new Map<number, PlayoffMapRegion[]>()
  for (const region of projection.regions) {
    try {
      const built = regionMap(region, schedules, firstWeek, teamsById, map)
      divisions.set(region.division, [...(divisions.get(region.division) ?? []), built])
    } catch (error) {
      console.warn(`Region ${region.region} is left out of the playoff map: ${String(error)}`)
    }
  }
  return {
    season: projection.season,
    shape: {
      width: map.width,
      height: map.height,
      outline: map.outline,
      counties: map.counties.map((county) => ({ name: county.name, path: county.path })),
    },
    asOf: projection.asOf,
    divisions: [...divisions.entries()]
      .sort(([first], [second]) => first - second)
      .map(
        ([division, regions]): PlayoffMapDivision => ({
          division,
          regions: regions.sort((first, second) => first.region - second.region),
        }),
      ),
  }
}

function regionMap(
  region: PlayoffRegion,
  schedules: Schedules,
  firstWeek: number | null,
  teamsById: ReadonlyMap<string, MapTeam>,
  map: CountyMap,
): PlayoffMapRegion {
  const outlooks = new Map(region.teams.map((team) => [team.teamId, team]))
  const bracket = firstWeek === null ? [] : regionGames(loadedTeamIds(region), schedules, firstWeek)
  const seeds = regionSeeds(
    region.teams.map((team) => team.teamId),
    bracket.filter((game) => game.round === 1),
  )
  const field = new Set(seeds)

  const teams = seeds.map((id, index) => {
    const outlook = outlooks.get(id)
    const mapTeam = teamsById.get(id)
    const coordinates = mapTeam?.coordinates
    const place = coordinates ? project(map.fit, coordinates.longitude, coordinates.latitude) : null
    return {
      id,
      sourceId: outlook?.sourceId ?? mapTeam?.sourceId ?? "",
      name: outlook?.name ?? mapTeam?.name ?? "",
      seed: index + 1,
      rating: outlook?.rating == null ? null : tenth(outlook.rating),
      color: mapTeam ? teamColor(mapTeam.primaryColor, mapTeam.secondaryColor) : null,
      x: place && Number.isFinite(place.x) ? tenth(place.x) : null,
      y: place && Number.isFinite(place.y) ? tenth(place.y) : null,
    }
  })

  const assigned = map.regions[region.division] ?? []
  const counties = map.counties.filter((_, index) => assigned[index] === region.region)
  const schools = teams.flatMap((team) =>
    team.x === null || team.y === null
      ? []
      : [{ id: team.id, seed: team.seed, x: team.x, y: team.y }],
  )
  const cells =
    counties.length === 0
      ? []
      : seededTerritories(
          schools,
          areaShape(counties.map((county) => county.path)),
          unionBounds(counties.map((county) => county.bounds)) as Bounds,
        )

  return {
    region: region.region,
    counties: counties.map((county) => county.name),
    teams,
    cells,
    games: bracket
      .filter((game) => game.teamIds.every((id) => field.has(id)))
      .map((game) => ({
        id: game.id,
        round: game.round as PlayoffRound,
        date: game.date,
        winnerId: game.winnerId,
        loserId: game.loserId,
      })),
  }
}

function tenth(value: number) {
  return Math.round(value * 10) / 10
}
