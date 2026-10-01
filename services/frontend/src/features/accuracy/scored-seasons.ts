/**
 * The first season of the headline numbers and of every view but the chart by season. From 2000 on
 * the scores come from one source, every season has overtime, and the evaluate command of the
 * rating service scores the same range.
 */
export const FIRST_SCORED_SEASON = 2000

/**
 * The first season of the chart by season. 1972 is left out, because it is the first season of
 * the data: every team starts at the prior of its division, so its predictions say little about
 * the model. 1973 to 1999 come from a second source and allow ties until 1984, so they are shown
 * for context only.
 */
export const FIRST_CHART_SEASON = 1973
