import { describe, expect, it } from "vitest"
import {
  assertBelowTeamLimit,
  drawnTeamIds,
  TEAM_QUERY_LIMIT,
} from "@/features/teams/utils/team-limit"

describe("assertBelowTeamLimit", () => {
  it("allows a season below the cap", () => {
    expect(() => assertBelowTeamLimit(2026, 0)).not.toThrow()
    expect(() => assertBelowTeamLimit(2026, TEAM_QUERY_LIMIT - 1)).not.toThrow()
  })

  it("stops a season that fills the cap", () => {
    expect(() => assertBelowTeamLimit(2026, TEAM_QUERY_LIMIT)).toThrow(
      "season 2026 returned 1000 teams, which fills the cap of 1000",
    )
  })

  it("stops a season above the cap", () => {
    expect(() => assertBelowTeamLimit(2026, TEAM_QUERY_LIMIT + 1)).toThrow(
      "Raise the cap in the API",
    )
  })
})

describe("drawnTeamIds", () => {
  const teams = [{ id: "a" }, { id: "b" }, { id: "c" }]

  it("draws every team without a limit", () => {
    expect(drawnTeamIds(teams)).toEqual(["a", "b", "c"])
  })

  it("draws only the first teams with a limit below the length", () => {
    expect(drawnTeamIds(teams, 2)).toEqual(["a", "b"])
  })

  it("draws every team with a limit above the length", () => {
    expect(drawnTeamIds(teams, 10)).toEqual(["a", "b", "c"])
  })

  it("draws a team that is listed twice one time", () => {
    expect(drawnTeamIds([{ id: "a" }, { id: "b" }, { id: "a" }, { id: "c" }], 3)).toEqual([
      "a",
      "b",
      "c",
    ])
  })
})
