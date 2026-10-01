import {
  formatBin,
  formatCount,
  formatDateRange,
  formatPercent,
  formatScore,
} from "@/features/accuracy/utils/format"
import type {
  AccuracyScore,
  ConfidenceBin,
  PhaseAccuracy,
  SeasonAccuracy,
  SeasonPhase,
  SeasonReport,
  SeasonWeekAccuracy,
} from "@/types/api"

/** A share as a percent for a chart, or null when the share is missing. */
function percent(share: number | null) {
  return share === null ? null : share * 100
}

/** One point of the chart by season. */
export interface SeasonPoint {
  season: number
  label: string
  /** The accuracy in percent. */
  accuracy: number | null
  brierScore: number | null
  games: number
  inProgress: boolean
}

/** The seasons from firstSeason on that have a scored game, for the chart by season. */
export function seasonSeries(seasons: SeasonAccuracy[], firstSeason: number): SeasonPoint[] {
  return seasons
    .filter((season) => season.season >= firstSeason && season.score.games > 0)
    .map((season) => ({
      season: season.season,
      label: season.season.toString(),
      accuracy: percent(season.score.accuracy),
      brierScore: season.score.brierScore,
      games: season.score.games,
      inProgress: season.inProgress,
    }))
}

/** One point of the chart of the weeks of the current season. */
export interface WeekPoint {
  week: number
  label: string
  /** The accuracy in percent. */
  accuracy: number | null
  games: number
}

/** The weeks that have a scored game, for the chart of the weeks of the current season. */
export function weekSeries(weeks: Pick<SeasonWeekAccuracy, "week" | "score">[]): WeekPoint[] {
  return weeks
    .filter((week) => week.score.games > 0)
    .map((week) => ({
      week: week.week,
      label: `Wk ${week.week}`,
      accuracy: percent(week.score.accuracy),
      games: week.score.games,
    }))
}

const phaseLabels: Record<SeasonPhase, string> = {
  EARLY: "Early (weeks 1–3)",
  MID: "Mid (weeks 4–7)",
  LATE: "Late (week 8 on)",
  PLAYOFF: "Playoffs",
}

/** One row of the table by phase. */
export interface PhaseRow {
  id: SeasonPhase
  label: string
  games: number
  accuracy: number | null
  brierScore: number | null
  logLoss: number | null
}

export function phaseRows(phases: PhaseAccuracy[]): PhaseRow[] {
  return phases.map(({ phase, score }) => ({
    id: phase,
    label: phaseLabels[phase],
    games: score.games,
    accuracy: score.accuracy,
    brierScore: score.brierScore,
    logLoss: score.logLoss,
  }))
}

/** One row of the table of confidence bins. The predicted and observed rates are in percent. */
export interface ConfidenceRow {
  id: string
  label: string
  games: number
  /** The share of all the games that fall in the bin. */
  share: number | null
  predicted: number | null
  observed: number | null
}

export function confidenceRows(bins: ConfidenceBin[]): ConfidenceRow[] {
  const total = bins.reduce((sum, bin) => sum + bin.games, 0)
  return bins.map((bin) => ({
    id: bin.lowerBound.toFixed(2),
    label: formatBin(bin.lowerBound, bin.upperBound),
    games: bin.games,
    share: total === 0 ? null : bin.games / total,
    predicted: percent(bin.meanProbability),
    observed: percent(bin.observedRate),
  }))
}

/** One point of the calibration chart, in percent. */
export interface CalibrationPoint {
  label: string
  predicted: number
  observed: number
  games: number
}

/** The bins that have a game, as points of predicted against observed. */
export function calibrationPoints(bins: ConfidenceBin[]): CalibrationPoint[] {
  return bins.flatMap((bin) =>
    bin.meanProbability === null || bin.observedRate === null
      ? []
      : [
          {
            label: formatBin(bin.lowerBound, bin.upperBound),
            predicted: bin.meanProbability * 100,
            observed: bin.observedRate * 100,
            games: bin.games,
          },
        ],
  )
}

/** The grade of the last week of the current season. */
export interface ReportCard {
  week: number
  correct: number
  decided: number
  /** The decided games in which the model called the margin exactly. */
  exactMargins: number
  expected: number
  accuracy: number | null
  brierScore: number | null
  pending: number
}

/** The grade of the last week of the season, or null when no week has results yet. */
export function reportCard(current: SeasonReport): ReportCard | null {
  const week = current.lastWeek
  if (!week) return null
  const { score } = week
  return {
    week: week.week,
    correct: score.correct,
    decided: score.decided,
    exactMargins: score.exactMargins,
    expected: score.expectedCorrect,
    accuracy: score.accuracy,
    brierScore: score.brierScore,
    pending: week.pendingGames,
  }
}

/** One row of the Hall of Shame. */
export interface WorstWeekRow {
  id: string
  season: number
  week: number
  dates: string
  correct: number
  expected: number
  /** The correct picks minus the expected correct picks. It is negative for a bad week. */
  shortfall: number
  accuracy: number | null
}

export function worstWeekRows(weeks: SeasonWeekAccuracy[]): WorstWeekRow[] {
  return weeks.map((week) => ({
    id: `${week.season}-${week.week}`,
    season: week.season,
    week: week.week,
    dates: formatDateRange(week.firstDate, week.lastDate),
    correct: week.score.correct,
    expected: week.score.expectedCorrect,
    shortfall: week.score.correct - week.score.expectedCorrect,
    accuracy: week.score.accuracy,
  }))
}

/** One tile of the headline numbers. */
export interface HeadlineTile {
  id: string
  label: string
  value: string
}

/** The four headline numbers. */
export function headline(overall: AccuracyScore): HeadlineTile[] {
  return [
    { id: "accuracy", label: "Accuracy", value: formatPercent(overall.accuracy) },
    { id: "brier", label: "Brier score", value: formatScore(overall.brierScore) },
    { id: "log-loss", label: "Log loss", value: formatScore(overall.logLoss) },
    { id: "games", label: "Games scored", value: formatCount(overall.games) },
  ]
}

/**
 * The range of a percent axis: the values with some room on each side, rounded out to steps of
 * five, and kept from 0 to 100. With no value, the axis shows 50 to 100.
 */
export function percentDomain(values: (number | null)[]): [number, number] {
  const known = values.filter((value): value is number => value !== null)
  if (known.length === 0) return [50, 100]
  const low = Math.floor((Math.min(...known) - 2) / 5) * 5
  const high = Math.ceil((Math.max(...known) + 2) / 5) * 5
  return [Math.max(0, low), Math.min(100, high)]
}

/** The ticks of a percent axis: every ten points, or every five on a short axis. */
export function percentTicks([low, high]: [number, number]): number[] {
  const step = high - low > 30 ? 10 : 5
  const ticks: number[] = []
  for (let tick = Math.ceil(low / step) * step; tick <= high; tick += step) ticks.push(tick)
  return ticks
}
