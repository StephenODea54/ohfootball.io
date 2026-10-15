import type { GameLocation, TeamRecord } from "@/types/api"

/** The types of the playoffProjection query. They follow services/api/graph/playoffs.graphqls. */

export interface PlayoffRecordOdds {
  record: TeamRecord
  probability: number
  runs: number
  lowAverage: number
  medianAverage: number
  highAverage: number
  qualifyProbability: number
  homeProbability: number
  byeProbability: number
}

export interface PlayoffGame {
  id: string
  date: string
  opponentId: string
  opponentName: string
  location: GameLocation
  winProbability: number | null
  qualifyIfWin: number | null
  qualifyIfLoss: number | null
  homeIfWin: number | null
  homeIfLoss: number | null
}

export interface PlayoffOutlook {
  teamId: string
  sourceId: string
  name: string
  rating: number | null
  record: TeamRecord
  levelOne: number
  levelTwo: number
  divisor: number
  average: number
  qualifyProbability: number
  homeProbability: number
  byeProbability: number
  regionWinProbability: number
  expectedSeed: number
  remainingGames: PlayoffGame[]
  records: PlayoffRecordOdds[]
}

export interface PlayoffRegion {
  region: number
  division: number
  teams: PlayoffOutlook[]
}

export interface PlayoffProjection {
  season: number
  asOf: string
  runs: number
  qualifiers: number
  byes: number
  homeGames: number
  regions: PlayoffRegion[]
}

/** A team as the odds table shows it. Its record is text, such as 7-1, and its odds are rounded. */
export interface PlayoffRow {
  sourceId: string
  name: string
  rating: number | null
  record: string
  qualifyProbability: number
  byeProbability: number
  homeProbability: number
  regionWinProbability: number
}

/** A remaining game as the details of a team show it. */
export type PlayoffDetailGame = Pick<
  PlayoffGame,
  "id" | "date" | "opponentName" | "location" | "winProbability" | "qualifyIfWin" | "qualifyIfLoss"
>

/** A final record as the details of a team show it. */
export type PlayoffDetailRecord = Pick<
  PlayoffRecordOdds,
  "record" | "probability" | "runs" | "lowAverage" | "highAverage" | "qualifyProbability"
>

/** A team as its details show it. */
export interface PlayoffDetail {
  teamId: string
  sourceId: string
  name: string
  record: string
  levelOne: number
  levelTwo: number
  divisor: number
  average: number
  homeProbability: number
  remainingGames: PlayoffDetailGame[]
  records: PlayoffDetailRecord[]
}

/** The file of one region: the rows of its table and the details of its teams. */
export interface RegionData {
  rows: PlayoffRow[]
  details: PlayoffDetail[]
}

/** A region and its division, without its teams. */
export interface RegionKey {
  region: number
  division: number
}
