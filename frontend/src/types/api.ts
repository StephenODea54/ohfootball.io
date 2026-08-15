/**
 * The football entities the site reads. A component may take one as a prop without depending on
 * the code that fetches it.
 *
 * The rating fields are named for what they mean rather than for the Elo model that produces
 * them. The team queries alias the API fields to match.
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
  asOf: string
}

export type GameResult = "WIN" | "LOSS" | "TIE" | "CANCELED" | "UNKNOWN"
export type GameLocation = "HOME" | "AWAY" | "NEUTRAL"

export interface GamePrediction {
  winProbability: number
  predictedResult: GameResult
  teamRating: number
  opponentRating: number
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
  id: string
  season: number
  name: string
  mascot: string | null
  city: string | null
  division: number | null
  region: number | null
  primaryColor: string | null
  secondaryColor: string | null
  record: TeamRecord
  rating: TeamRating | null
  ratingHistory: TeamRating[]
  schedule: Game[]
}
