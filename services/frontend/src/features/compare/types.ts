import type { ProgramGame } from "@/types/api"

/** The rating of a program at the end of one season. */
export interface SeasonPoint {
  season: number
  /** The relative rating in points. 0 is the median Ohio team of that season. */
  rating: number
  rank: number
  /** The date of the snapshot. It is 31 December for a past season. */
  asOf: string
}

/** The two team colors of a school in the form #rrggbb. A color is null when the data has none. */
export interface SchoolColors {
  primary: string | null
  secondary: string | null
}

/** One program across every season the site knows, as programs/<sourceId>.json holds it. */
export interface ProgramHistory {
  sourceId: string
  /** The name in the current season. */
  name: string
  /** The id of the team page in the current season. */
  teamId: string
  /** The colors of the team in the current season. The chart draws the line of the school in them. */
  colors: SchoolColors
  seasons: SeasonPoint[]
  /** The games against Ohio teams that have a result, oldest first. */
  games: ProgramGame[]
}

/**
 * One program in a picker. The page holds one for every program that has a history file, so it
 * holds only the id and the name.
 */
export type ProgramOption = Pick<ProgramHistory, "sourceId" | "name">
