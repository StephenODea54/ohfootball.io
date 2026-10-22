import { describe, expect, it } from "vitest"
import {
  dayNumber,
  firstRoundWeek,
  regionGames,
  type Schedules,
  weekStart,
} from "@/features/playoff-map/utils/rounds"
import type { Game } from "@/types/api"

function game(fields: Partial<Game> & Pick<Game, "id" | "date" | "opponentId">): Game {
  return {
    week: 1,
    opponentName: fields.opponentId,
    location: "HOME",
    result: "UNKNOWN",
    teamScore: null,
    opponentScore: null,
    playoff: true,
    notes: null,
    prediction: null,
    ...fields,
  }
}

describe("dayNumber", () => {
  it("counts days from 1970-01-01 and ignores a time", () => {
    expect(dayNumber("1970-01-02")).toBe(1)
    expect(dayNumber("2026-10-30T23:00:00")).toBe(dayNumber("2026-10-30"))
  })
})

describe("weekStart", () => {
  it("gives the Wednesday of a Friday, a Saturday, a Monday, and a Wednesday", () => {
    const wednesday = dayNumber("2026-10-28")
    expect(weekStart(dayNumber("2026-10-30"))).toBe(wednesday)
    expect(weekStart(dayNumber("2026-10-31"))).toBe(wednesday)
    expect(weekStart(dayNumber("2026-11-02"))).toBe(wednesday)
    expect(weekStart(wednesday)).toBe(wednesday)
    expect(weekStart(dayNumber("2026-11-03"))).toBe(wednesday)
  })

  it("works for a day before 1970", () => {
    expect(weekStart(dayNumber("1969-12-26"))).toBe(dayNumber("1969-12-24"))
  })
})

describe("firstRoundWeek", () => {
  it("is null with no playoff game", () => {
    const schedules: Schedules = new Map([
      ["a", [game({ id: "g", date: "2026-10-23", opponentId: "b", playoff: false })]],
    ])
    expect(firstRoundWeek(schedules)).toBeNull()
  })

  it("takes the week with the most playoff games, so one wrong mark does not move it", () => {
    const schedules: Schedules = new Map([
      [
        "a",
        [
          game({ id: "wrong", date: "2026-10-23", opponentId: "x" }),
          game({ id: "r1a", date: "2026-10-30", opponentId: "b" }),
          game({ id: "r2", date: "2026-11-06", opponentId: "c" }),
        ],
      ],
      ["b", [game({ id: "r1a", date: "2026-10-30", opponentId: "a" })]],
      [
        "c",
        [
          game({ id: "r1b", date: "2026-10-31", opponentId: "d" }),
          game({ id: "gone", date: "2026-10-24", opponentId: "e", result: "CANCELED" }),
          game({ id: "gone2", date: "2026-10-24", opponentId: "f", result: "CANCELED" }),
        ],
      ],
    ])
    expect(firstRoundWeek(schedules)).toBe(dayNumber("2026-10-28"))
  })

  it("takes the earlier week on a tie", () => {
    const schedules: Schedules = new Map([
      [
        "a",
        [
          game({ id: "late", date: "2026-11-06", opponentId: "b" }),
          game({ id: "early", date: "2026-10-30", opponentId: "c" }),
        ],
      ],
    ])
    expect(firstRoundWeek(schedules)).toBe(dayNumber("2026-10-28"))
  })
})

const first = dayNumber("2026-10-28")

describe("regionGames", () => {
  it("joins the two sides of a game and takes the winner, the home team, and the round", () => {
    const schedules: Schedules = new Map([
      ["a", [game({ id: "g", date: "2026-11-07", opponentId: "b", result: "WIN" })]],
      [
        "b",
        [game({ id: "g", date: "2026-11-07", opponentId: "a", result: "LOSS", location: "AWAY" })],
      ],
    ])

    expect(regionGames(["a", "b"], schedules, first)).toEqual([
      {
        id: "g",
        round: 2,
        date: "2026-11-07",
        teamIds: ["a", "b"],
        homeId: "a",
        winnerId: "a",
        loserId: "b",
      },
    ])
  })

  it("takes a loss from one side as a win of the other", () => {
    const schedules: Schedules = new Map([
      [
        "a",
        [game({ id: "g", date: "2026-10-30", opponentId: "b", result: "LOSS", location: "AWAY" })],
      ],
    ])

    expect(regionGames(["a", "b"], schedules, first)).toEqual([
      {
        id: "g",
        round: 1,
        date: "2026-10-30",
        teamIds: ["a", "b"],
        homeId: "b",
        winnerId: "b",
        loserId: "a",
      },
    ])
  })

  it("gives no winner to a double forfeit, a tie, or a game still to come", () => {
    const schedules: Schedules = new Map([
      [
        "a",
        [
          game({
            id: "ff",
            date: "2026-10-30",
            opponentId: "b",
            result: "LOSS",
            location: "NEUTRAL",
          }),
          game({ id: "tie", date: "2026-11-06", opponentId: "c", result: "TIE" }),
          game({ id: "next", date: "2026-11-13", opponentId: "d" }),
        ],
      ],
      [
        "b",
        [
          game({
            id: "ff",
            date: "2026-10-30",
            opponentId: "a",
            result: "LOSS",
            location: "NEUTRAL",
          }),
        ],
      ],
    ])

    const games = regionGames(["a", "b", "c", "d"], schedules, first)

    expect(games.map((item) => [item.id, item.winnerId, item.loserId, item.homeId])).toEqual([
      ["ff", null, null, null],
      ["tie", null, null, "a"],
      ["next", null, null, "a"],
    ])
  })

  it("leaves out games that are not playoff games of the region in rounds 1 to 4", () => {
    const schedules: Schedules = new Map([
      [
        "a",
        [
          game({ id: "regular", date: "2026-10-23", opponentId: "b", playoff: false }),
          game({ id: "early", date: "2026-10-23", opponentId: "b" }),
          game({ id: "canceled", date: "2026-10-30", opponentId: "b", result: "CANCELED" }),
          game({ id: "other", date: "2026-10-30", opponentId: "z", result: "WIN" }),
          game({ id: "state", date: "2026-11-27", opponentId: "b", result: "WIN" }),
          game({ id: "final", date: "2026-11-20", opponentId: "b", result: "WIN" }),
        ],
      ],
    ])

    expect(regionGames(["a", "b"], schedules, first).map((item) => item.id)).toEqual(["final"])
  })

  it("sorts by round, then by day, then by id, and skips a team with no schedule", () => {
    const schedules: Schedules = new Map([
      [
        "a",
        [
          game({ id: "v", date: "2026-11-07", opponentId: "e" }),
          game({ id: "y", date: "2026-11-06", opponentId: "b" }),
          game({ id: "x", date: "2026-11-06", opponentId: "c" }),
          game({ id: "w", date: "2026-10-30", opponentId: "d" }),
        ],
      ],
    ])

    expect(regionGames(["a", "b", "c", "d", "e"], schedules, first).map((item) => item.id)).toEqual(
      ["w", "x", "y", "v"],
    )
  })
})
