import { describe, expect, it } from "vitest"
import {
  bestSeason,
  decadeRows,
  gamesPlayed,
  MIN_GAMES,
  medianRank,
  playoffAppearances,
  qualifies,
  qualifyingSeasons,
  RECENT_SEASONS,
  type SeasonRow,
  sumRecords,
  topTenFinishes,
  toSeasonRows,
  visibleSeasons,
  worstSeason,
} from "@/features/teams/utils/program-history"
import { massillonHistory } from "@/test/massillon-history"
import type { ProgramSeason } from "@/types/api"

function row(overrides: Partial<SeasonRow> = {}): SeasonRow {
  return {
    season: 2020,
    record: { wins: 5, losses: 5, ties: 0 },
    playoffRecord: { wins: 0, losses: 0, ties: 0 },
    rating: 10,
    rank: 50,
    inProgress: false,
    ...overrides,
  }
}

function programSeason(overrides: Partial<ProgramSeason> = {}): ProgramSeason {
  return {
    season: 2025,
    record: { wins: 12, losses: 2, ties: 0 },
    playoffRecord: { wins: 3, losses: 1, ties: 0 },
    rating: { value: 48.26, rank: 3 },
    ...overrides,
  }
}

const massillon = toSeasonRows({
  season: 2026,
  programHistory: massillonHistory,
})

describe("toSeasonRows", () => {
  it("marks the current season in progress", () => {
    const rows = toSeasonRows({
      season: 2026,
      programHistory: [programSeason(), programSeason({ season: 2026 })],
    })

    expect(rows.map((season) => season.inProgress)).toEqual([false, true])
    expect(rows[0]).toMatchObject({ rating: 48.3, rank: 3 })
  })

  it("drops a season after the season of the page", () => {
    const rows = toSeasonRows({
      season: 2025,
      programHistory: [programSeason(), programSeason({ season: 2026 })],
    })

    expect(rows.map((season) => season.season)).toEqual([2025])
    expect(rows[0].inProgress).toBe(true)
  })

  it("leaves a season without a rating unrated", () => {
    const [season] = toSeasonRows({
      season: 2026,
      programHistory: [programSeason({ rating: null })],
    })

    expect(season).toMatchObject({ rating: null, rank: null })
  })
})

describe("qualifies", () => {
  it("refuses the season in progress, an unrated season, and a season with too few games", () => {
    expect(MIN_GAMES).toBe(5)
    expect(qualifies(row({ inProgress: true }))).toBe(false)
    expect(qualifies(row({ rank: null, rating: null }))).toBe(false)
    expect(qualifies(row({ rating: null }))).toBe(false)
    expect(qualifies(row({ record: { wins: 2, losses: 1, ties: 1 } }))).toBe(false)
    expect(qualifies(row({ record: { wins: 2, losses: 2, ties: 1 } }))).toBe(true)
  })

  it("counts wins, losses, and ties as games played", () => {
    expect(gamesPlayed({ wins: 3, losses: 2, ties: 1 })).toBe(6)
  })
})

describe("bestSeason", () => {
  it("picks the lowest rank, then the higher rating, then the later season", () => {
    expect(
      bestSeason([row({ season: 2001, rank: 5 }), row({ season: 2002, rank: 3 })])?.season,
    ).toBe(2002)
    expect(
      bestSeason([
        row({ season: 2001, rank: 3, rating: 40 }),
        row({ season: 2002, rank: 3, rating: 30 }),
      ])?.season,
    ).toBe(2001)
    expect(
      bestSeason([row({ season: 2001, rank: 3 }), row({ season: 2002, rank: 3 })])?.season,
    ).toBe(2002)
  })

  it("answers null when nothing qualifies", () => {
    expect(bestSeason([])).toBeNull()
    expect(bestSeason([row({ inProgress: true })])).toBeNull()
  })
})

describe("worstSeason", () => {
  it("picks the highest rank, then the lower rating, then the later season", () => {
    expect(
      worstSeason([row({ season: 2001, rank: 90 }), row({ season: 2002, rank: 30 })])?.season,
    ).toBe(2001)
    expect(
      worstSeason([
        row({ season: 2001, rank: 90, rating: 5 }),
        row({ season: 2002, rank: 90, rating: 8 }),
      ])?.season,
    ).toBe(2001)
    expect(
      worstSeason([row({ season: 2001, rank: 90 }), row({ season: 2002, rank: 90 })])?.season,
    ).toBe(2002)
  })

  it("answers null when nothing qualifies", () => {
    expect(worstSeason([])).toBeNull()
    expect(worstSeason([row({ inProgress: true })])).toBeNull()
  })
})

describe("topTenFinishes", () => {
  it("counts rank 10 and not rank 11, and skips the season in progress", () => {
    const rows = [row({ rank: 10 }), row({ rank: 11 }), row({ rank: 1, inProgress: true })]

    expect(topTenFinishes(rows)).toBe(1)
    expect(qualifyingSeasons(rows)).toBe(2)
  })
})

describe("playoffAppearances", () => {
  it("counts the complete seasons with a playoff game", () => {
    const appearances = playoffAppearances([
      row({ playoffRecord: { wins: 3, losses: 1, ties: 0 } }),
      row({ playoffRecord: { wins: 0, losses: 1, ties: 0 } }),
      row(),
      row({ playoffRecord: { wins: 2, losses: 0, ties: 0 }, inProgress: true }),
    ])

    expect(appearances).toBe(2)
  })
})

describe("sumRecords", () => {
  it("adds each part of each record", () => {
    expect(
      sumRecords([
        { wins: 1, losses: 2, ties: 1 },
        { wins: 3, losses: 0, ties: 1 },
      ]),
    ).toEqual({ wins: 4, losses: 2, ties: 2 })
    expect(sumRecords([])).toEqual({ wins: 0, losses: 0, ties: 0 })
  })
})

describe("decadeRows", () => {
  it("groups the seasons of each decade, newest first, and leaves out the season in progress", () => {
    const decades = decadeRows([
      row({ season: 1975, rank: 20, playoffRecord: { wins: 1, losses: 1, ties: 0 } }),
      row({ season: 1979, rank: 40 }),
      row({ season: 1995, rank: 7, record: { wins: 2, losses: 1, ties: 0 } }),
      row({ season: 2026, inProgress: true }),
    ])

    expect(decades).toEqual([
      {
        id: "1990s",
        seasons: 1,
        record: { wins: 2, losses: 1, ties: 0 },
        playoffAppearances: 0,
        medianRank: null,
        bestRank: null,
      },
      {
        id: "1970s",
        seasons: 2,
        record: { wins: 10, losses: 10, ties: 0 },
        playoffAppearances: 1,
        medianRank: 30,
        bestRank: 20,
      },
    ])
  })
})

describe("medianRank", () => {
  it("takes the middle rank, and rounds the mean of two middle ranks half up", () => {
    expect(medianRank([7, 3])).toBe(5)
    expect(medianRank([3, 8])).toBe(6)
    expect(medianRank([9, 4, 1])).toBe(4)
    expect(medianRank([4])).toBe(4)
    expect(medianRank([])).toBeNull()
  })
})

describe("visibleSeasons", () => {
  it("shows the recent seasons newest first, or all of them", () => {
    expect(RECENT_SEASONS).toBe(10)
    expect(visibleSeasons(massillon, false).map((season) => season.season)).toEqual([
      2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017,
    ])
    const all = visibleSeasons(massillon, true)
    expect(all).toHaveLength(55)
    expect(all.at(-1)?.season).toBe(1972)
    expect(massillon[0].season).toBe(1972)
  })
})

describe("the history of Massillon", () => {
  it("matches the numbers of the warehouse", () => {
    expect(massillon).toHaveLength(55)
    expect(bestSeason(massillon)).toMatchObject({ season: 2023, rank: 1, rating: 65.2 })
    expect(worstSeason(massillon)).toMatchObject({ season: 2015, rank: 102 })
    expect(topTenFinishes(massillon)).toBe(27)
    expect(qualifyingSeasons(massillon)).toBe(54)
    expect(playoffAppearances(massillon)).toBe(32)
    expect(
      sumRecords(massillon.filter((season) => !season.inProgress).map((season) => season.record)),
    ).toEqual({
      wins: 467,
      losses: 157,
      ties: 4,
    })
    expect(decadeRows(massillon).map((decade) => decade.id)).toEqual([
      "2020s",
      "2010s",
      "2000s",
      "1990s",
      "1980s",
      "1970s",
    ])
  })
})
