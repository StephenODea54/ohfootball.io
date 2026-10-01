import { describe, expect, it } from "vitest"
import {
  headToHead,
  type Meeting,
  meetingLabel,
  meetingWinner,
  seriesSummary,
  streakLabel,
} from "@/features/compare/utils/head-to-head"
import type { GameResult, ProgramGame } from "@/types/api"

function game(
  date: string,
  result: GameResult,
  { opponent = "306", playoff = false } = {},
): ProgramGame {
  return {
    season: Number(date.slice(0, 4)),
    date,
    opponentSourceId: opponent,
    result,
    teamScore: result === "WIN" ? 21 : 14,
    opponentScore: result === "WIN" ? 14 : result === "TIE" ? 14 : 21,
    playoff,
  }
}

describe("headToHead", () => {
  it("gives an empty record when the programs never met", () => {
    expect(headToHead({ games: [game("2020-10-01", "WIN", { opponent: "1258" })] }, "306")).toEqual(
      {
        record: { wins: 0, losses: 0, ties: 0 },
        first: null,
        last: null,
        streak: null,
        meetings: [],
      },
    )
  })

  it("counts the record", () => {
    const result = headToHead(
      {
        games: [
          game("2001-10-20", "WIN"),
          game("2002-10-19", "LOSS"),
          game("2003-10-18", "TIE"),
          game("2003-11-14", "WIN", { playoff: true }),
        ],
      },
      "306",
    )

    expect(result.record).toEqual({ wins: 2, losses: 1, ties: 1 })
  })

  it("keeps two games of one season in the order of their dates", () => {
    const result = headToHead(
      { games: [game("2010-11-12", "LOSS", { playoff: true }), game("2010-10-16", "WIN")] },
      "306",
    )

    expect(result.meetings.map((meeting) => meeting.date)).toEqual(["2010-11-12", "2010-10-16"])
    expect(result.first?.date).toBe("2010-10-16")
    expect(result.last?.date).toBe("2010-11-12")
  })

  it("counts the run of wins at the end", () => {
    const result = headToHead(
      {
        games: [
          game("2020-10-17", "LOSS"),
          game("2021-10-16", "WIN"),
          game("2022-10-15", "WIN"),
          game("2023-10-14", "WIN"),
        ],
      },
      "306",
    )

    expect(result.streak).toEqual({ result: "WIN", length: 3 })
  })

  it("ends a streak with a tie", () => {
    const result = headToHead(
      { games: [game("2021-10-16", "WIN"), game("2022-10-15", "WIN"), game("2023-10-14", "TIE")] },
      "306",
    )

    expect(result.streak).toEqual({ result: "TIE", length: 1 })
  })

  it("counts every meeting in the streak when all have one result", () => {
    const result = headToHead(
      { games: [game("2022-10-15", "LOSS"), game("2023-10-14", "LOSS")] },
      "306",
    )

    expect(result.streak).toEqual({ result: "LOSS", length: 2 })
  })

  it("leaves out a game with no result", () => {
    const result = headToHead(
      { games: [game("2023-10-14", "WIN"), game("2024-10-12", "CANCELED")] },
      "306",
    )

    expect(result.meetings).toHaveLength(1)
  })
})

describe("seriesSummary", () => {
  it("names the leader with its wins first", () => {
    expect(seriesSummary("Massillon", "McKinley", { wins: 35, losses: 24, ties: 1 })).toBe(
      "Massillon leads 35–24–1",
    )
    expect(seriesSummary("Massillon", "McKinley", { wins: 24, losses: 35, ties: 0 })).toBe(
      "McKinley leads 35–24",
    )
  })

  it("tells a tied series", () => {
    expect(seriesSummary("Piqua", "Troy", { wins: 3, losses: 3, ties: 2 })).toBe(
      "Series tied 3–3–2",
    )
  })

  it("gives null when the programs never met", () => {
    expect(seriesSummary("Piqua", "Troy", { wins: 0, losses: 0, ties: 0 })).toBeNull()
  })
})

function meeting(result: Meeting["result"], teamScore: number, opponentScore: number): Meeting {
  return {
    id: "2025-10-18-0",
    season: 2025,
    date: "2025-10-18",
    teamScore,
    opponentScore,
    result,
    playoff: false,
  }
}

describe("meetingWinner", () => {
  it("names the winner or a tie", () => {
    expect(meetingWinner(meeting("WIN", 28, 21), "Piqua", "Troy")).toBe("Piqua")
    expect(meetingWinner(meeting("LOSS", 21, 28), "Piqua", "Troy")).toBe("Troy")
    expect(meetingWinner(meeting("TIE", 14, 14), "Piqua", "Troy")).toBe("Tie")
  })
})

describe("meetingLabel", () => {
  it("puts the winner and its score first", () => {
    expect(meetingLabel(meeting("LOSS", 21, 28), "Piqua", "Troy")).toBe(
      "Oct 18, 2025: Troy won 28–21",
    )
    expect(meetingLabel(meeting("TIE", 14, 14), "Piqua", "Troy")).toBe("Oct 18, 2025: tie 14–14")
  })
})

describe("streakLabel", () => {
  it("names who won the last meetings", () => {
    expect(streakLabel({ result: "WIN", length: 3 }, "Piqua", "Troy")).toBe(
      "Piqua won the last 3 meetings",
    )
    expect(streakLabel({ result: "LOSS", length: 1 }, "Piqua", "Troy")).toBe(
      "Troy won the last meeting",
    )
  })

  it("tells a run of ties", () => {
    expect(streakLabel({ result: "TIE", length: 1 }, "Piqua", "Troy")).toBe(
      "The last meeting was a tie",
    )
    expect(streakLabel({ result: "TIE", length: 2 }, "Piqua", "Troy")).toBe(
      "Tied the last 2 meetings",
    )
  })
})
