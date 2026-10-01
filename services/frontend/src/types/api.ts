/**
 * The football entities the site reads. A component may take one as a prop without depending on
 * the code that fetches it.
 *
 * A rating value is the relative rating in points: the number of points by which a team would be
 * expected to beat the median Ohio team on a neutral field. The team queries alias the API field
 * to match.
 */

export interface TeamRecord {
  wins: number
  losses: number
  ties: number
}

export interface TeamRating {
  season: number
  value: number
  rank: number
  /** The rank one week before asOf. The API gives it for every rating. */
  previousRank: number | null
  asOf: string
}

export type GameResult = "WIN" | "LOSS" | "TIE" | "CANCELED" | "UNKNOWN"
export type GameLocation = "HOME" | "AWAY" | "NEUTRAL"

export interface GamePrediction {
  winProbability: number
  /** The margin the model expects for the team, in points. A negative margin is a loss. */
  predictedMargin: number
  asOf: string
}

export interface Game {
  id: string
  week: number
  date: string
  opponentId: string
  opponentName: string
  location: GameLocation
  result: GameResult
  teamScore: number | null
  opponentScore: number | null
  playoff: boolean
  notes: string | null
  prediction: GamePrediction | null
}

export interface Team {
  /** The key of the team in one season. A team has a different id in each season. */
  id: string
  season: number
  /**
   * The identifier of the team in its source. For a team from joeeitel.com, it is the number that
   * joeeitel.com gives to the team. It stays the same across seasons.
   */
  sourceId: string
  name: string
  mascot: string | null
  city: string | null
  /** The Ohio county of the school without the word County, such as Stark. */
  county: string | null
  division: number | null
  region: number | null
  primaryColor: string | null
  secondaryColor: string | null
  record: TeamRecord
  /**
   * The number of games this season that the team played against an out-of-state team. The rating
   * leaves these games out.
   */
  outOfStateGamesPlayed: number
  rating: TeamRating | null
  ratingHistory: TeamRating[]
  schedule: Game[]
}

/** A team as the list of a season returns it, without its rating history and its schedule. */
export type TeamSummary = Omit<Team, "ratingHistory" | "schedule">
