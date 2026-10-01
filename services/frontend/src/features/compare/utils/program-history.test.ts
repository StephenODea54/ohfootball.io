import { describe, expect, it, vi } from "vitest"
import {
  isSafeSourceId,
  safePrograms,
  toProgramHistory,
  toProgramOption,
} from "@/features/compare/utils/program-history"
import type { Program, ProgramGame, TeamSummary } from "@/types/api"

const team = {
  id: "team-2026",
  season: 2026,
  sourceId: "1624",
  name: "Massillon Washington",
  mascot: "Tigers",
  city: "Massillon",
  division: 2,
  region: 7,
  primaryColor: "#FF6600",
  secondaryColor: "#000000",
  record: { wins: 5, losses: 1, ties: 0 },
  outOfStateGamesPlayed: 0,
  county: "Stark",
  rating: null,
} satisfies TeamSummary

const game: ProgramGame = {
  season: 2025,
  date: "2025-10-18",
  opponentSourceId: "306",
  result: "WIN",
  teamScore: 28,
  opponentScore: 21,
  playoff: false,
}

describe("isSafeSourceId", () => {
  it("allows a number of up to 20 digits", () => {
    expect(isSafeSourceId("1624")).toBe(true)
    expect(isSafeSourceId("1".repeat(20))).toBe(true)
  })

  it("refuses anything else", () => {
    for (const id of ["", "1".repeat(21), "../x", "ohhsfbdb:sheet720", "12a", " 12"]) {
      expect(isSafeSourceId(id), id).toBe(false)
    }
  })
})

describe("toProgramOption", () => {
  it("keeps only what a picker needs", () => {
    expect(toProgramOption(team)).toEqual({ sourceId: "1624", name: "Massillon Washington" })
  })
})

describe("toProgramHistory", () => {
  it("joins the team of the current season with the program", () => {
    const program: Program = {
      sourceId: "1624",
      ratingHistory: [
        { season: 2025, value: 20, rank: 5, asOf: "2025-12-31" },
        { season: 2026, value: 10, rank: 9, asOf: "2026-09-21" },
        { season: 2026, value: 14.26, rank: 7, asOf: "2026-09-29" },
      ],
      games: [game],
    }

    const history = toProgramHistory(team, program)

    expect(history.teamId).toBe("team-2026")
    expect(history.name).toBe("Massillon Washington")
    expect(history.seasons).toEqual([
      { season: 2025, rating: 20, rank: 5, asOf: "2025-12-31" },
      { season: 2026, rating: 14.3, rank: 7, asOf: "2026-09-29" },
    ])
    expect(history.games).toEqual([game])
  })
})

describe("safePrograms", () => {
  it("keeps a team with a safe id and warns one time about each other team", () => {
    const warn = vi.fn()
    const old = { ...team, sourceId: "ohhsfbdb:sheet720", name: "Old School" }

    expect(safePrograms([team, old], warn)).toEqual([team])
    expect(safePrograms([team, old], warn)).toEqual([team])

    expect(warn).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Old School"))
  })

  it("warns in the log of the build by default", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    safePrograms([{ ...team, sourceId: "../x" }])
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
