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

/** One season of a program, as it stands at the end of that season. */
export interface ProgramSeason {
  season: number
  record: TeamRecord
  playoffRecord: TeamRecord
  /**
   * The relative rating and the rank in the last snapshot of the season. Null when the season has
   * none. The team query selects only these two fields, because the page embeds every season.
   */
  rating: Pick<TeamRating, "value" | "rank"> | null
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
  /** Every season the program played, oldest first. */
  programHistory: ProgramSeason[]
  schedule: Game[]
}

/** A team as the list of a season returns it, without its histories and its schedule. */
export type TeamSummary = Omit<Team, "ratingHistory" | "programHistory" | "schedule">

/**
 * The scores of a set of predictions. A tie counts as half a win in the Brier score and the log
 * loss, and it is not part of the winner accuracy. A rate is null when no game gives it a value.
 */
export interface AccuracyScore {
  games: number
  ties: number
  /** The games with a winner and a pick. */
  decided: number
  /** The decided games in which the favorite won. */
  correct: number
  accuracy: number | null
  /** The number of correct picks that the model expected. */
  expectedCorrect: number
  brierScore: number | null
  logLoss: number | null
}

export interface SeasonAccuracy {
  season: number
  /** The games of the season with a prediction and no result yet. */
  pendingGames: number
  inProgress: boolean
  score: AccuracyScore
}

/**
 * One week of one season. Weeks run from Wednesday to Tuesday. Week 1 is the first week of the
 * season with at least 50 games between two Ohio teams.
 */
export interface SeasonWeekAccuracy {
  season: number
  week: number
  firstDate: string
  lastDate: string
  pendingGames: number
  score: AccuracyScore
}

export type SeasonPhase = "EARLY" | "MID" | "LATE" | "PLAYOFF"

export interface PhaseAccuracy {
  phase: SeasonPhase
  score: AccuracyScore
}

/** The games in which the favorite had a probability from lowerBound up to upperBound. */
export interface ConfidenceBin {
  lowerBound: number
  upperBound: number
  games: number
  ties: number
  meanProbability: number | null
  favoriteWins: number
  /** The wins of the favorite plus half the ties, divided by the games. */
  observedRate: number | null
  accuracy: number | null
}

/** A team of a scored game. The id is the key of the team in the season of the game. */
export interface ScoredTeam {
  id: string
  sourceId: string
  name: string
  score: number | null
}

/** A game with a winner, seen from the winner. */
export interface ScoredGame {
  id: string
  season: number
  date: string
  winner: ScoredTeam
  loser: ScoredTeam
  /** The win probability the model gave the winner before the game. */
  winnerProbability: number
}

/** The current season: its weeks and the last week with results. */
export interface SeasonReport {
  season: number
  weeks: SeasonWeekAccuracy[]
  lastWeek: SeasonWeekAccuracy | null
  lastWeekUpsets: ScoredGame[]
}

/** How the predictions did on the games that have a result. */
export interface ModelAccuracy {
  currentSeason: number
  fromSeason: number
  overall: AccuracyScore
  /** Every season with a prediction. It is not cut to the range. */
  seasons: SeasonAccuracy[]
  phases: PhaseAccuracy[]
  confidence: ConfidenceBin[]
  upsets: ScoredGame[]
  worstWeeks: SeasonWeekAccuracy[]
  current: SeasonReport
}

/**
 * One game of a program, from the side of the program. The API lists only a game against an Ohio
 * team with a result of win, loss, or tie and both scores. The API also gives the name of the
 * opponent and the place of the game, but the site does not ask for them.
 */
export interface ProgramGame {
  season: number
  date: string
  /** The source identifier of the opponent. It stays the same across seasons. */
  opponentSourceId: string
  result: GameResult
  teamScore: number
  opponentScore: number
  playoff: boolean
}

/** A school across every season, keyed by its source identifier. */
export interface Program {
  sourceId: string
  /** The site does not ask for the previous rank of a program. */
  ratingHistory: Omit<TeamRating, "previousRank">[]
  games: ProgramGame[]
}
