import type {
  PlayoffProjection,
  PlayoffRegion,
  RegionData,
  RegionKey,
} from "@/features/playoffs/types"
import { formatRecord } from "@/features/playoffs/utils/format"

/** A probability with three decimals. The page shows whole percents, so more is only weight. */
function chance(value: number): number {
  return Math.round(value * 1000) / 1000
}

function hundredths(value: number): number {
  return Math.round(value * 100) / 100
}

/** The regions of a projection in order, without their teams. */
export function regionKeys(projection: PlayoffProjection): RegionKey[] {
  return projection.regions
    .map(({ region, division }) => ({ region, division }))
    .sort((a, b) => a.region - b.region)
}

/** The rows of the table and the details of the teams of one region, for the file of the region. */
export function regionData(region: PlayoffRegion): RegionData {
  return {
    rows: region.teams.map((team) => ({
      sourceId: team.sourceId,
      name: team.name,
      rating: team.rating === null ? null : Math.round(team.rating * 10) / 10,
      record: formatRecord(team.record),
      qualifyProbability: chance(team.qualifyProbability),
      byeProbability: chance(team.byeProbability),
      homeProbability: chance(team.homeProbability),
      regionWinProbability: chance(team.regionWinProbability),
    })),
    details: region.teams.map((team) => ({
      teamId: team.teamId,
      sourceId: team.sourceId,
      name: team.name,
      record: formatRecord(team.record),
      levelOne: team.levelOne,
      levelTwo: team.levelTwo,
      divisor: team.divisor,
      average: hundredths(team.average),
      homeProbability: chance(team.homeProbability),
      remainingGames: team.remainingGames.map((game) => ({
        id: game.id,
        date: game.date,
        opponentName: game.opponentName,
        location: game.location,
        winProbability: game.winProbability === null ? null : chance(game.winProbability),
        qualifyIfWin: game.qualifyIfWin === null ? null : chance(game.qualifyIfWin),
        qualifyIfLoss: game.qualifyIfLoss === null ? null : chance(game.qualifyIfLoss),
      })),
      records: team.records.map((record) => ({
        record: record.record,
        probability: chance(record.probability),
        runs: record.runs,
        lowAverage: record.lowAverage,
        highAverage: record.highAverage,
        qualifyProbability: chance(record.qualifyProbability),
      })),
    })),
  }
}

/** The divisions in order, each with the numbers of its regions in order. */
export function divisionsOf(
  regions: readonly RegionKey[],
): { division: number; regions: number[] }[] {
  const divisions = new Map<number, number[]>()
  for (const region of regions) {
    divisions.set(region.division, [...(divisions.get(region.division) ?? []), region.region])
  }
  return [...divisions.entries()]
    .sort(([a], [b]) => a - b)
    .map(([division, list]) => ({ division, regions: [...list].sort((a, b) => a - b) }))
}

export interface Selection {
  division: number
  region: number
}

/**
 * Reads the division and the region from the query string of the page, such as ?division=3&region=11.
 * A value that the projection does not hold falls back to the first region of the division, or to
 * the first division.
 */
export function selectionFrom(
  search: string,
  divisions: readonly { division: number; regions: number[] }[],
): Selection | null {
  if (divisions.length === 0) return null
  const params = new URLSearchParams(search)
  const division =
    divisions.find((item) => item.division === Number(params.get("division"))) ?? divisions[0]
  const region = Number(params.get("region"))
  return {
    division: division.division,
    region: division.regions.includes(region) ? region : division.regions[0],
  }
}
