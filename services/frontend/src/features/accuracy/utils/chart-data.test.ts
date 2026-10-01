import { describe, expect, it } from "vitest"
import {
  calibrationPoints,
  confidenceRows,
  headline,
  percentDomain,
  percentTicks,
  phaseRows,
  reportCard,
  seasonSeries,
  weekSeries,
  worstWeekRows,
} from "@/features/accuracy/utils/chart-data"
import type { AccuracyScore, ConfidenceBin, SeasonReport, SeasonWeekAccuracy } from "@/types/api"

function score(
  games: number,
  accuracy: number | null,
  extra: Partial<AccuracyScore> = {},
): AccuracyScore {
  return {
    games,
    ties: 0,
    decided: games,
    correct: accuracy === null ? 0 : Math.round(games * accuracy),
    exactMargins: 0,
    accuracy,
    expectedCorrect: games * 0.8,
    brierScore: games ? 0.13 : null,
    logLoss: games ? 0.4 : null,
    ...extra,
  }
}

function week(
  season: number,
  number: number,
  games: number,
  extra: Partial<SeasonWeekAccuracy> = {},
): SeasonWeekAccuracy {
  return {
    season,
    week: number,
    firstDate: "2026-09-24",
    lastDate: "2026-09-26",
    pendingGames: 0,
    score: score(games, 0.8),
    ...extra,
  }
}

function bin(
  lowerBound: number,
  games: number,
  meanProbability: number | null,
  observedRate: number | null,
): ConfidenceBin {
  return {
    lowerBound,
    upperBound: lowerBound + 0.05,
    games,
    ties: 0,
    meanProbability,
    favoriteWins: games,
    observedRate,
    accuracy: observedRate,
  }
}

describe("seasonSeries", () => {
  it("keeps the seasons from the first season on that have a game", () => {
    const series = seasonSeries(
      [
        { season: 1972, pendingGames: 0, inProgress: false, score: score(3365, 0.72) },
        { season: 1973, pendingGames: 0, inProgress: false, score: score(3400, 0.75) },
        { season: 2026, pendingGames: 1370, inProgress: true, score: score(2025, 0.8025) },
        { season: 2027, pendingGames: 300, inProgress: false, score: score(0, null) },
      ],
      1973,
    )
    expect(series.map((point) => point.season)).toEqual([1973, 2026])
    expect(series[1]).toEqual({
      season: 2026,
      label: "2026",
      accuracy: 80.25,
      brierScore: 0.13,
      games: 2025,
      inProgress: true,
    })
  })

  it("keeps a missing accuracy missing", () => {
    const [point] = seasonSeries(
      [{ season: 1980, pendingGames: 0, inProgress: false, score: score(5, null) }],
      1973,
    )
    expect(point?.accuracy).toBeNull()
  })
})

describe("weekSeries", () => {
  it("hides the weeks with no scored game", () => {
    const weeks = [
      { week: 1, score: score(340, 0.75) },
      { week: 2, score: score(0, null) },
    ]
    expect(weekSeries(weeks)).toEqual([{ week: 1, label: "Wk 1", accuracy: 75, games: 340 }])
  })
})

describe("phaseRows", () => {
  it("names each phase", () => {
    const rows = phaseRows([
      { phase: "EARLY", score: score(10, 0.75) },
      { phase: "MID", score: score(10, 0.82) },
      { phase: "LATE", score: score(10, 0.84) },
      { phase: "PLAYOFF", score: score(0, null) },
    ])
    expect(rows.map((row) => row.label)).toEqual([
      "Early (weeks 1–3)",
      "Mid (weeks 4–7)",
      "Late (week 8 on)",
      "Playoffs",
    ])
    expect(rows[0]).toMatchObject({
      id: "EARLY",
      games: 10,
      accuracy: 0.75,
      brierScore: 0.13,
      logLoss: 0.4,
    })
    expect(rows[3]?.accuracy).toBeNull()
  })
})

describe("the confidence bins", () => {
  const bins = [bin(0.5, 30, 0.525, 0.52), bin(0.55, 0, null, null), bin(0.95, 70, 0.98, 0.986)]

  it("gives each bin its share of the games", () => {
    const rows = confidenceRows(bins)
    expect(rows[0]).toEqual({
      id: "0.50",
      label: "50–55%",
      games: 30,
      share: 0.3,
      predicted: 52.5,
      observed: 52,
    })
    expect(rows[1]?.predicted).toBeNull()
    expect(rows[2]?.label).toBe("95–100%")
    expect(confidenceRows([bin(0.5, 0, null, null)])[0]?.share).toBeNull()
  })

  it("draws only the bins that have a game", () => {
    const points = calibrationPoints(bins)
    expect(points).toHaveLength(2)
    expect(points[1]).toEqual({ label: "95–100%", predicted: 98, observed: 98.6, games: 70 })
    expect(calibrationPoints([bin(0.5, 1, 0.52, null)])).toEqual([])
  })
})

describe("reportCard", () => {
  function report(lastWeek: SeasonWeekAccuracy | null): SeasonReport {
    return {
      season: 2026,
      weeks: lastWeek ? [lastWeek] : [],
      lastWeek,
      lastWeekUpsets: [],
      lastWeekExactMarginGames: [],
    }
  }

  it("grades the last week", () => {
    const card = reportCard(
      report(
        week(2026, 6, 337, {
          pendingGames: 2,
          score: score(337, 0.8694, {
            correct: 293,
            decided: 337,
            exactMargins: 5,
            expectedCorrect: 295,
            brierScore: 0.0869,
          }),
        }),
      ),
    )
    expect(card).toEqual({
      week: 6,
      correct: 293,
      decided: 337,
      exactMargins: 5,
      expected: 295,
      accuracy: 0.8694,
      brierScore: 0.0869,
      pending: 2,
    })
  })

  it("gives null before the first result of the season", () => {
    expect(reportCard(report(null))).toBeNull()
  })
})

describe("worstWeekRows", () => {
  it("gives the shortfall of each week", () => {
    const [row] = worstWeekRows([
      week(2015, 4, 347, {
        firstDate: "2015-09-17",
        lastDate: "2015-09-19",
        score: score(347, 0.7637, { correct: 265, expectedCorrect: 285.7 }),
      }),
    ])
    expect(row).toMatchObject({
      id: "2015-4",
      season: 2015,
      week: 4,
      dates: "Sep 17 – 19",
      correct: 265,
      expected: 285.7,
      accuracy: 0.7637,
    })
    expect(row?.shortfall).toBeCloseTo(-20.7)
  })
})

describe("headline", () => {
  it("gives the four numbers", () => {
    const tiles = headline(score(97688, 0.80779, { brierScore: 0.13088, logLoss: 0.40148 }))
    expect(tiles.map((tile) => [tile.label, tile.value])).toEqual([
      ["Accuracy", "80.8%"],
      ["Brier score", "0.1309"],
      ["Log loss", "0.4015"],
      ["Games scored", "97,688"],
    ])
    expect(headline(score(0, null))[0]?.value).toBe("—")
  })
})

describe("percentDomain", () => {
  it("rounds out to steps of five with room on each side", () => {
    expect(percentDomain([71.4, null, 86.9])).toEqual([65, 90])
    expect(percentDomain([1, 99])).toEqual([0, 100])
    expect(percentDomain([null])).toEqual([50, 100])
  })
})

describe("percentTicks", () => {
  it("steps by five on a short axis and by ten on a long one", () => {
    expect(percentTicks([65, 90])).toEqual([65, 70, 75, 80, 85, 90])
    expect(percentTicks([50, 100])).toEqual([50, 60, 70, 80, 90, 100])
    expect(percentTicks([55, 100])).toEqual([60, 70, 80, 90, 100])
  })
})
