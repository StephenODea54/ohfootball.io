import type { Circle } from "@/features/map/utils/territories"

/** A playoff team of a region, with its seed and the place of its school on the map. */
export interface PlayoffMapTeam {
  id: string
  /** The joeeitel.com team number, which names the logo file. */
  sourceId: string
  name: string
  /** 1 to 12. */
  seed: number
  /** The relative rating with one decimal, or null when the team has none. */
  rating: number | null
  /** A team color that shows on a dark and a white page, or null. */
  color: string | null
  /** The place of the school, in map units, with one decimal. Null when the school has none. */
  x: number | null
  y: number | null
}

/**
 * The land that a team holds before the first playoff game. A cell keeps its shape through the
 * playoffs. Only its owner changes.
 */
export interface PlayoffMapCell {
  /** The id of the team that starts with this land. */
  id: string
  /** The land as an SVG path. A hole is a ring inside a ring, so draw it with the even-odd rule. */
  path: string
  /** A large circle inside the land, for the logo and the seed. */
  circle: Circle
  /** The area of the land inside the region, in square map units. */
  land: number
}

/** A playoff round of a region: 1 is the first round and 4 is the regional final. */
export type PlayoffRound = 1 | 2 | 3 | 4

/** A playoff game of a region. A game with no result yet has no winner and no loser. */
export interface PlayoffMapGame {
  id: string
  round: PlayoffRound
  /** The day of the game, such as 2026-10-30. */
  date: string
  winnerId: string | null
  loserId: string | null
}

export interface PlayoffMapRegion {
  region: number
  /** The names of the counties that the map gives to the region. */
  counties: string[]
  /** The 12 playoff teams, best seed first. */
  teams: PlayoffMapTeam[]
  /** The land of each team, largest first, so a small piece inside a large piece draws on top. */
  cells: PlayoffMapCell[]
  games: PlayoffMapGame[]
}

/** The playoff map of one division. */
export interface PlayoffMapDivision {
  division: number
  regions: PlayoffMapRegion[]
}

/** The shape of Ohio and its counties, in map units. */
export interface PlayoffMapShape {
  width: number
  height: number
  outline: string
  counties: { name: string; path: string }[]
}

/** The playoff map of a season: each division with the four regions of its bracket. */
export interface PlayoffMapData {
  season: number
  shape: PlayoffMapShape
  /** The date of the projection that gave the seeds. */
  asOf: string
  divisions: PlayoffMapDivision[]
}
