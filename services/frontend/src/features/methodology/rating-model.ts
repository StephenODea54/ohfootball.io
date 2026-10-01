/**
 * The values of the model that makes the published ratings, and the text that tells a reader what
 * a rating means. The values must match the defaults of MarginConfig in
 * services/rating/src/ohfootball_rating/margin.py. A unit test fails when the two files do not
 * agree.
 *
 * The methodology page and the About page also describe the model. A new model needs new text
 * in each of these places.
 */

/** The points added to the expected margin of the home team. */
export const HOME_EDGE = 1.5

/** The largest margin that one game counts in an update. */
export const MARGIN_CAP = 56

/** The learning weight of a team that has played n games this season is RATE / (n + OFFSET). */
export const LEARNING_RATE = 1.65
export const LEARNING_OFFSET = 5

/** The points between the priors of two divisions for a program with no history. */
export const DIVISION_STEP = 12

/** The shares of the last season and of the mean of the earlier seasons in a season start. */
export const CARRYOVER_LAST = 0.8
export const CARRYOVER_OLDER = 0.2

/** The number of earlier seasons in the mean of the earlier seasons. */
export const HISTORY_SEASONS = 8

/** The number of earlier seasons that each win probability slope is fit on. */
export const SLOPE_SEASONS = 10

/** The share of its normal change that an Ohio team moves by in a game against another state. */
export const OTHER_STATE_WEIGHT = 0.5

/**
 * A new out-of-state opponent starts at the average that games against its state gave, mixed with
 * this many games of the average of the division of its Ohio opponent.
 */
export const OTHER_STATE_SHRINKAGE = 20

/** The number of earlier seasons that the start of a new out-of-state opponent reads. */
export const OTHER_STATE_WINDOW_SEASONS = 10

/** The fewest games that give the average of a division for that start. */
export const OTHER_STATE_MIN_GAMES = 30

/** The share of a surprise that moves the rating of a team that has played n games. */
export function learningWeight(gamesPlayed: number) {
  return LEARNING_RATE / (gamesPlayed + LEARNING_OFFSET)
}

/** What a rating means, in words that fit next to a rating. */
export const RATING_SUMMARY =
  "A rating is a number of points. The gap between two ratings is the margin the model expects " +
  "on a neutral field, and 0 is the median Ohio team."
